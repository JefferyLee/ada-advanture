import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { PAINT_COLORS, drawingBox, drawingLook, strokePath } from './model.js';
import { buildRegions, paintFills, regionAt } from './regions.js';
import { imageBlob } from './store.js';

// How much to thicken lines when finding areas, for small / medium / big gaps.
const GAPS = [{ label: 'Small', gap: 3 }, { label: 'Medium', gap: 6 }, { label: 'Big', gap: 12 }];
const DEFAULT_GAP = 6;
// Pen and eraser widths, as a part of the drawing's longer side.
const WIDTHS = [{ label: 'Thin', pen: 0.006, eraser: 0.02 }, { label: 'Normal', pen: 0.012, eraser: 0.04 }, { label: 'Thick', pen: 0.025, eraser: 0.08 }];
const HISTORY = 50; // undo steps kept; each fill keeps a copy of the colors
const NOTES = {
  pen: 'Pick a color and draw.',
  eraser: 'Rub out lines, your pencil lines too. Colors stay.',
  photoEraser: 'Rub out lines, and bits of your photo too.',
  fill: 'Pick a color, then tap a part of your drawing.',
  clear: 'Tap a color to take it off.',
};

const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
const round = (v) => Math.round(v * 10) / 10;
const RGB = PAINT_COLORS.map(({ hex }) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// The line art of a stored drawing, or a blank sheet when it has none.
async function loadLineArt(id, w, h) {
  if (!id) return canvasOf(w, h);
  const blob = await imageBlob(id);
  if (!blob) throw new Error('line art not available');
  const bitmap = await createImageBitmap(blob);
  const c = canvasOf(bitmap.width, bitmap.height);
  c.getContext('2d').drawImage(bitmap, 0, 0);
  return c;
}

// Pen and eraser strokes on top of what is already on ctx. The strokes are in
// the coordinates of the whole straightened photo; box is where this drawing
// was cut from it.
function drawEdits(ctx, edits, box) {
  ctx.save();
  ctx.translate(-box.x, -box.y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const e of edits) {
    ctx.globalCompositeOperation = e.erase ? 'destination-out' : 'source-over';
    ctx.strokeStyle = e.erase ? '#000' : e.color;
    ctx.lineWidth = e.size;
    ctx.stroke(new Path2D(strokePath(e.points)));
  }
  ctx.restore();
}

// The line art with Ada's strokes on it.
function inkOf(art, edits, box) {
  const c = canvasOf(art.width, art.height);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(art, 0, 0);
  drawEdits(ctx, edits, box);
  return c;
}

function regionsOf(ink, gap) {
  const { data } = ink.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, ink.width, ink.height);
  const alpha = new Uint8Array(ink.width * ink.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  return buildRegions(alpha, ink.width, ink.height, gap);
}

// Colors are kept as one byte per pixel: 0 for none, otherwise 1 + the
// paint color's place in PAINT_COLORS.
function colorsFromFills(labels, w, h, fills) {
  const pick = new Map();
  for (const f of fills) {
    const label = regionAt(labels, w, h, f.x * w, f.y * h);
    if (label) pick.set(label, f.color ? PAINT_COLORS.findIndex((c) => c.hex === f.color) + 1 : 0);
  }
  const colors = new Uint8Array(w * h);
  for (let i = 0; i < colors.length; i++) colors[i] = pick.get(labels[i]) || 0;
  return colors;
}

// The saved color layer read back into paint colors.
async function colorsFromImage(id, w, h) {
  const blob = await imageBlob(id);
  if (!blob) return null;
  const ctx = canvasOf(w, h).getContext('2d', { willReadFrequently: true });
  ctx.drawImage(await createImageBitmap(blob), 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const colors = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < colors.length; i++, p += 4) {
    if (data[p + 3] < 128) continue;
    let best = 0;
    let bestD = Infinity;
    RGB.forEach(([r, g, b], k) => {
      const d = (data[p] - r) ** 2 + (data[p + 1] - g) ** 2 + (data[p + 2] - b) ** 2;
      if (d < bestD) { bestD = d; best = k + 1; }
    });
    colors[i] = best;
  }
  return colors;
}

function colorLayer(colors, w, h) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, p = 0; i < colors.length; i++, p += 4) {
    if (!colors[i]) continue;
    const [r, g, b] = RGB[colors[i] - 1];
    px[p] = r; px[p + 1] = g; px[p + 2] = b; px[p + 3] = 255;
  }
  const c = canvasOf(w, h);
  c.getContext('2d').putImageData(new ImageData(px, w, h), 0, 0);
  return c;
}

// The color layer for a drawing's saved fills, worked out again on another
// version of the same drawing (used when Ada switches between its lines).
export async function recolor(version, edits, fills, gap = DEFAULT_GAP) {
  const art = await loadLineArt(version.id);
  const { labels } = regionsOf(inkOf(art, edits || [], version.box), gap);
  const c = canvasOf(art.width, art.height);
  c.getContext('2d').putImageData(new ImageData(paintFills(labels, art.width, art.height, fills), art.width, art.height), 0, 0);
  return toBlob(c);
}

// Drawing and coloring one drawing. Pen strokes and eraser strokes are kept in
// order on top of the line art, which itself never changes; colors go on a
// separate layer underneath. A fill colors the area its lines enclose now, and
// stays when lines are drawn or rubbed out later, as on paper. On the real
// photo there are no areas to fill, so only the pen and eraser are offered, and
// the fills made on its lines are handed back as they were.
export default function ColorStudio({ image, onCancel, onDone }) {
  const box = drawingBox(image);
  const photo = Boolean(drawingLook(image).photo);
  const [art, setArt] = useState(null); // canvas with the line art
  const [failed, setFailed] = useState(false);
  const [hist, setHist] = useState(null); // { past, now: { edits, fills, colors, gap }, future }
  const [tool, setTool] = useState(image.id && !photo ? 'fill' : 'pen'); // pen | eraser | fill | clear
  const [color, setColor] = useState(PAINT_COLORS[image.id ? 2 : 0].hex);
  const [width, setWidth] = useState(1);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef(null);
  const gesture = useRef(null);
  const penSeen = useRef(false);
  const frame = useRef(0);
  const made = useRef({}); // the ink, regions and color layer for the current state
  const now = hist?.now;

  useEffect(() => {
    let alive = true;
    (async () => {
      const a = await loadLineArt(image.id, image.w, image.h);
      const edits = image.edits ?? [];
      const fills = photo ? [] : image.fills ?? [];
      const gap = image.gap ?? DEFAULT_GAP;
      let colors = image.colorId ? await colorsFromImage(image.colorId, a.width, a.height) : null;
      if (!colors && photo) colors = new Uint8Array(a.width * a.height);
      if (!colors) colors = colorsFromFills(regionsOf(inkOf(a, edits, box), gap).labels, a.width, a.height, fills);
      if (!alive) return;
      setArt(a);
      setHist({ past: [], now: { edits, fills, colors, gap }, future: [] });
    })().catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image.id]);

  const inkFor = (edits) => {
    if (made.current.edits !== edits) made.current = { ...made.current, edits, ink: inkOf(art, edits, box), regions: null };
    return made.current.ink;
  };
  const regionsFor = (edits, gap) => {
    inkFor(edits);
    if (!made.current.regions || made.current.gap !== gap) Object.assign(made.current, { gap, regions: regionsOf(made.current.ink, gap) });
    return made.current.regions;
  };
  const layerFor = (colors) => {
    if (made.current.colors !== colors) Object.assign(made.current, { colors, layer: colorLayer(colors, art.width, art.height) });
    return made.current.layer;
  };

  // Colors, then the ink, then the stroke being drawn. A stroke being rubbed
  // out shows on a copy of the ink until it is done.
  const show = () => {
    const canvas = canvasRef.current;
    if (!canvas || !now) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(layerFor(now.colors), 0, 0);
    const g = gesture.current;
    let ink = inkFor(now.edits);
    if (g?.edit.erase) {
      if (!made.current.scratch) made.current.scratch = canvasOf(art.width, art.height);
      const s = made.current.scratch.getContext('2d');
      s.clearRect(0, 0, art.width, art.height);
      s.drawImage(ink, 0, 0);
      drawEdits(s, [g.edit], box);
      ink = made.current.scratch;
    }
    ctx.drawImage(ink, 0, 0);
    if (g && !g.edit.erase) drawEdits(ctx, [g.edit], box);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !art) return;
    if (canvas.width !== art.width || canvas.height !== art.height) {
      canvas.width = art.width;
      canvas.height = art.height;
    }
    show();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [art, now]);

  const commit = (next) => setHist((h) => ({ past: [...h.past, h.now].slice(-HISTORY), now: next, future: [] }));
  const undo = () => setHist((h) => (h.past.length
    ? { past: h.past.slice(0, -1), now: h.past[h.past.length - 1], future: [h.now, ...h.future] } : h));
  const redo = () => setHist((h) => (h.future.length
    ? { past: [...h.past, h.now], now: h.future[0], future: h.future.slice(1) } : h));

  // Where the pointer is, in the drawing's pixels.
  const spot = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return [((e.clientX - r.left) * art.width) / r.width, ((e.clientY - r.top) * art.height) / r.height];
  };

  const fillAt = ([x, y]) => {
    const { labels } = regionsFor(now.edits, now.gap);
    const label = regionAt(labels, art.width, art.height, x, y);
    if (!label) return;
    const paint = tool === 'fill' ? PAINT_COLORS.findIndex((c) => c.hex === color) + 1 : 0;
    const colors = now.colors.slice();
    for (let i = 0; i < colors.length; i++) if (labels[i] === label) colors[i] = paint;
    const fill = { x: x / art.width, y: y / art.height, color: tool === 'fill' ? color : null };
    commit({ ...now, colors, fills: [...now.fills, fill] });
  };

  const down = (e) => {
    if (!now || gesture.current) return;
    if (e.pointerType === 'pen') penSeen.current = true;
    // Once an Apple Pencil has been used, a finger or palm doesn't draw.
    if (e.pointerType === 'touch' && penSeen.current) return;
    e.preventDefault();
    if (tool === 'fill' || tool === 'clear') { fillAt(spot(e)); return; }
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = spot(e);
    const side = Math.max(art.width, art.height);
    const size = round(WIDTHS[width][tool] * side);
    const points = [round(box.x + x), round(box.y + y)];
    gesture.current = { pointer: e.pointerId, edit: tool === 'eraser' ? { erase: true, size, points } : { color, size, points } };
    show();
  };

  const move = (e) => {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    const batch = e.nativeEvent.getCoalescedEvents?.() ?? [];
    const p = g.edit.points;
    for (const ev of batch.length ? batch : [e.nativeEvent]) {
      const [x, y] = spot(ev);
      if (Math.hypot(box.x + x - p[p.length - 2], box.y + y - p[p.length - 1]) >= 1.5) p.push(round(box.x + x), round(box.y + y));
    }
    if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; show(); });
  };

  const up = (e) => {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    gesture.current = null;
    commit({ ...now, edits: [...now.edits, g.edit] });
  };

  const changeGap = (gap) => {
    if (gap === now.gap) return;
    const { labels } = regionsFor(now.edits, gap);
    commit({ ...now, gap, colors: colorsFromFills(labels, art.width, art.height, now.fills) });
  };

  const finish = async () => {
    setBusy(true);
    if (photo) { await onDone({ colorBlob: null, fills: image.fills ?? [], gap: now.gap, edits: now.edits }); return; }
    // Keep one fill per area: the last color each one was given.
    const { labels } = regionsFor(now.edits, now.gap);
    const last = new Map();
    for (const f of now.fills) {
      const label = regionAt(labels, art.width, art.height, f.x * art.width, f.y * art.height);
      if (!label) continue;
      last.delete(label);
      if (f.color) last.set(label, f);
    }
    const colorBlob = now.colors.some(Boolean) ? await toBlob(layerFor(now.colors)) : null;
    await onDone({ colorBlob, fills: [...last.values()], gap: now.gap, edits: now.edits });
  };

  const drawing = tool === 'pen' || tool === 'eraser';
  const empty = now && !now.edits.length && !now.fills.length && !now.colors.some(Boolean);

  return (
    <div className="gn-modal gn-modal-full" role="dialog" aria-modal="true" aria-label="Draw and color">
      <div className="gn-color">
        <header className="gn-topbar">
          <button className="gn-bar-btn" onClick={onCancel}><Icon name="close" /> Cancel</button>
          <span className="gn-wordmark gn-grow">Draw &amp; Color</span>
          <button className="gn-bar-btn" onClick={undo} disabled={!hist?.past.length}><Icon name="undo" /> Undo</button>
          <button className="gn-bar-btn" onClick={redo} disabled={!hist?.future.length}><Icon name="redo" /> Redo</button>
          <button className="gn-bar-btn" disabled={!now || empty}
            onClick={() => commit({ edits: [], fills: [], colors: new Uint8Array(art.width * art.height), gap: now.gap })}>
            Start Over
          </button>
          <button className="gn-bar-btn gn-bar-btn-yellow" onClick={finish} disabled={!now || busy}>
            <Icon name="check" size={20} stroke={2.8} /> Done
          </button>
        </header>

        <div className="gn-work">
          <aside className="gn-panel gn-panel-left" aria-label="Tools">
            <div className="gn-grid2">
              <button className="gn-tile gn-tool" aria-pressed={tool === 'pen'} onClick={() => setTool('pen')}>
                <Icon name="pen" size={24} /> Pen
              </button>
              <button className="gn-tile gn-tool" aria-pressed={tool === 'eraser'} onClick={() => setTool('eraser')}>
                <Icon name="eraser" size={24} /> Eraser
              </button>
              {!photo && (
                <>
                  <button className="gn-tile gn-tool" aria-pressed={tool === 'fill'} onClick={() => setTool('fill')}>
                    <Icon name="bucket" size={24} /> Fill
                  </button>
                  <button className="gn-tile gn-tool" aria-pressed={tool === 'clear'} onClick={() => setTool('clear')}>
                    <Icon name="close" size={24} /> Un-color
                  </button>
                </>
              )}
            </div>
            <p className="gn-note">{NOTES[photo && tool === 'eraser' ? 'photoEraser' : tool]}</p>
            {drawing && (
              <div className="gn-grid3">
                {WIDTHS.map((w, i) => {
                  const dot = [6, 12, 22][i];
                  return (
                    <button key={w.label} className="gn-tile gn-tile-short" aria-label={w.label} aria-pressed={width === i}
                      onClick={() => setWidth(i)}>
                      <span className="gn-dot" style={{ width: dot, height: dot }} />
                    </button>
                  );
                })}
              </div>
            )}
            {tool !== 'eraser' && tool !== 'clear' && (
              <div className="gn-grid3">
                {PAINT_COLORS.map((c) => (
                  <button key={c.hex} className="gn-paint" aria-label={c.label}
                    aria-pressed={color === c.hex} style={{ background: c.hex }}
                    onClick={() => { setColor(c.hex); if (!drawing) setTool('fill'); }} />
                ))}
              </div>
            )}
            {!drawing && (
              <div className="gn-field gn-panel-bottom">
                <span className="gn-label-strong">Is color leaking out?</span>
                <p className="gn-note">Lines with a gap let color escape. Tell me how big the gaps are.</p>
                <div className="gn-grid3">
                  {GAPS.map((g) => (
                    <button key={g.gap} className="gn-tile gn-tile-short gn-tile-small" aria-pressed={now?.gap === g.gap}
                      disabled={!now} onClick={() => changeGap(g.gap)}>{g.label}</button>
                  ))}
                </div>
              </div>
            )}
          </aside>

          <main className="gn-color-stage">
            {failed && <p className="gn-hint-big">I can't open this drawing.</p>}
            {!failed && !now && <p className="gn-hint-big">Getting your drawing ready...</p>}
            {!failed && (
              <canvas ref={canvasRef} className={`gn-color-canvas${drawing ? ' is-drawing' : ''}`}
                onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
                style={{
                  visibility: now ? 'visible' : 'hidden',
                  // As big as fits: full width, unless that would make it too tall.
                  width: art ? `min(100%, calc((100dvh - 150px) * ${art.width / art.height}))` : undefined,
                }} />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
