import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { PAINT_COLORS } from './model.js';
import { buildRegions, paintFills, regionAt } from './regions.js';
import { getImage } from './store.js';

// How much to thicken lines when finding areas, for small / medium / big gaps.
const GAPS = [{ label: 'Small', gap: 3 }, { label: 'Medium', gap: 6 }, { label: 'Big', gap: 12 }];
const DEFAULT_GAP = 6;

const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

// Tap-to-fill coloring for one drawing. The line art never changes; colors go
// on a separate layer underneath it.
export default function ColorStudio({ image, onCancel, onDone }) {
  const [art, setArt] = useState(null); // { bitmap, alpha, w, h }
  const [failed, setFailed] = useState(false);
  const [gap, setGap] = useState(image.gap ?? DEFAULT_GAP);
  const [hist, setHist] = useState({ past: [], fills: image.fills ?? [], future: [] });
  const [color, setColor] = useState(PAINT_COLORS[2].hex);
  const [tool, setTool] = useState('fill'); // fill | clear
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef(null);
  const { fills } = hist;

  useEffect(() => {
    let alive = true;
    (async () => {
      const blob = await getImage(image.id);
      const bitmap = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      c.width = bitmap.width;
      c.height = bitmap.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      const alpha = new Uint8Array(c.width * c.height);
      for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
      if (alive) setArt({ bitmap, alpha, w: c.width, h: c.height });
    })().catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [image.id]);

  const regions = useMemo(() => (art ? buildRegions(art.alpha, art.w, art.h, gap) : null), [art, gap]);

  const colorLayer = (list) => {
    const c = document.createElement('canvas');
    c.width = art.w;
    c.height = art.h;
    c.getContext('2d').putImageData(new ImageData(paintFills(regions.labels, art.w, art.h, list), art.w, art.h), 0, 0);
    return c;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !regions) return;
    canvas.width = art.w;
    canvas.height = art.h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(colorLayer(fills), 0, 0);
    ctx.drawImage(art.bitmap, 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regions, fills]);

  const commit = (next) => setHist((h) => ({ past: [...h.past, h.fills], fills: next, future: [] }));
  const undo = () => setHist((h) => (h.past.length
    ? { past: h.past.slice(0, -1), fills: h.past[h.past.length - 1], future: [h.fills, ...h.future] } : h));
  const redo = () => setHist((h) => (h.future.length
    ? { past: [...h.past, h.fills], fills: h.future[0], future: h.future.slice(1) } : h));

  const tap = (e) => {
    if (!regions) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    if (!regionAt(regions.labels, art.w, art.h, x * art.w, y * art.h)) return;
    commit([...fills, { x, y, color: tool === 'fill' ? color : null }]);
  };

  const finish = async () => {
    setBusy(true);
    // Keep one fill per area: the last color each one was given.
    const last = new Map();
    for (const f of fills) {
      const label = regionAt(regions.labels, art.w, art.h, f.x * art.w, f.y * art.h);
      if (!label) continue;
      last.delete(label);
      if (f.color) last.set(label, f);
    }
    const kept = [...last.values()];
    const colorBlob = kept.length ? await toBlob(colorLayer(kept)) : null;
    await onDone({ colorBlob, fills: kept, gap });
  };

  return (
    <div className="gn-modal gn-modal-full" role="dialog" aria-modal="true" aria-label="Color your drawing">
      <div className="gn-color">
        <header className="gn-topbar">
          <button className="gn-bar-btn" onClick={onCancel}><Icon name="close" /> Cancel</button>
          <span className="gn-wordmark gn-grow">Color It</span>
          <button className="gn-bar-btn" onClick={undo} disabled={!hist.past.length}><Icon name="undo" /> Undo</button>
          <button className="gn-bar-btn" onClick={redo} disabled={!hist.future.length}><Icon name="redo" /> Redo</button>
          <button className="gn-bar-btn" onClick={() => commit([])} disabled={!fills.length}>Start Over</button>
          <button className="gn-bar-btn gn-bar-btn-yellow" onClick={finish} disabled={!regions || busy}>
            <Icon name="check" size={20} stroke={2.8} /> Done
          </button>
        </header>

        <div className="gn-work">
          <aside className="gn-panel gn-panel-left" aria-label="Paint">
            <div className="gn-panel-title">Paint</div>
            <div className="gn-grid2">
              <button className="gn-tile gn-tool" aria-pressed={tool === 'fill'} onClick={() => setTool('fill')}>
                <Icon name="bucket" size={24} /> Fill
              </button>
              <button className="gn-tile gn-tool" aria-pressed={tool === 'clear'} onClick={() => setTool('clear')}>
                <Icon name="eraser" size={24} /> Un-color
              </button>
            </div>
            <p className="gn-note">Pick a color, then tap a part of your drawing.</p>
            <div className="gn-grid3">
              {PAINT_COLORS.map((c) => (
                <button key={c.hex} className="gn-paint" aria-label={c.label}
                  aria-pressed={tool === 'fill' && color === c.hex} style={{ background: c.hex }}
                  onClick={() => { setColor(c.hex); setTool('fill'); }} />
              ))}
            </div>
            <div className="gn-field gn-panel-bottom">
              <span className="gn-label-strong">Is color leaking out?</span>
              <p className="gn-note">Lines with a gap let color escape. Tell me how big the gaps are.</p>
              <div className="gn-grid3">
                {GAPS.map((g) => (
                  <button key={g.gap} className="gn-tile gn-tile-short gn-tile-small" aria-pressed={gap === g.gap}
                    onClick={() => setGap(g.gap)}>{g.label}</button>
                ))}
              </div>
            </div>
          </aside>

          <main className="gn-color-stage">
            {failed && <p className="gn-hint-big">I can't open this drawing.</p>}
            {!failed && !regions && <p className="gn-hint-big">Getting your drawing ready...</p>}
            {!failed && (
              <canvas ref={canvasRef} className="gn-color-canvas" onPointerDown={tap}
                style={{
                  visibility: regions ? 'visible' : 'hidden',
                  // As big as fits: full width, unless that would make it too tall.
                  width: art ? `min(100%, calc((100dvh - 150px) * ${art.w / art.h}))` : undefined,
                }} />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
