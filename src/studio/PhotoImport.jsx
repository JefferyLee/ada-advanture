import { useEffect, useRef, useState } from 'react';
import { readMyWords } from './HelperBar.jsx';
import Icon from './Icon.jsx';
import { cleanLineArt } from './cleanup.js';
import { FULL_FRAME, detectPage, straightSize, straighten, toSmallGray } from './perspective.js';
import { loadBitmap } from './photo.js';
import { keepFigure, neatSvg, traceNeat } from './vectorize.js';

const SOURCE_SIDE = 2200; // the photo is shrunk to this before anything else
const OUT_SIDE = 1500; // longest side of the straightened, cleaned drawing
const VIEW_SIDE = 1200; // longest side of the photo as shown on screen
const MARGIN = 12; // blank space kept around the trimmed drawing

const CORNER_NAMES = ['Top left corner', 'Top right corner', 'Bottom right corner', 'Bottom left corner'];
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// The photo, shrunk and turned, with its pixels ready to read.
function makeSource(bitmap, quarterTurns) {
  const k = Math.min(1, SOURCE_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * k);
  const h = Math.round(bitmap.height * k);
  const sideways = quarterTurns % 2 === 1;
  const canvas = document.createElement('canvas');
  canvas.width = sideways ? h : w;
  canvas.height = sideways ? w : h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((quarterTurns * Math.PI) / 2);
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
  return { canvas, pixels: ctx.getImageData(0, 0, canvas.width, canvas.height), w: canvas.width, h: canvas.height };
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

function sheetPhoto(pixels) {
  const canvas = document.createElement('canvas');
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  canvas.getContext('2d').putImageData(new ImageData(pixels.data, pixels.width, pixels.height), 0, 0);
  return toBlob(canvas, 'image/jpeg', 0.85);
}

// The part of the cleaned page to keep: the lines plus a little blank margin.
function cropBox(result) {
  const { x0, y0, x1, y1 } = result.bbox;
  const sx = Math.max(0, x0 - MARGIN);
  const sy = Math.max(0, y0 - MARGIN);
  return { sx, sy, w: Math.min(result.width, x1 + 1 + MARGIN) - sx, h: Math.min(result.height, y1 + 1 + MARGIN) - sy };
}

const inkOf = (result) => {
  let n = 0;
  for (let i = 3; i < result.data.length; i += 4) if (result.data[i]) n++;
  return n;
};

// "Just my character": clear everything around the main figure.
function onlyFigure(result) {
  const { width: w, height: h, data } = result;
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  const kept = keepFigure(alpha, w, h);
  if (!kept) return result;
  const out = new Uint8ClampedArray(data);
  let x0 = w; let y0 = h; let x1 = -1; let y1 = -1;
  for (let i = 0; i < kept.length; i++) {
    out[i * 4 + 3] = kept[i];
    if (!kept[i]) continue;
    const x = i % w; const y = (i - x) / w;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { width: w, height: h, data: out, bbox: x1 < 0 ? null : { x0, y0, x1, y1 } };
}

// "Neat lines" for the kept part of the page, as an SVG string the size of the crop.
function neatFor(result) {
  const { sx, sy, w, h } = cropBox(result);
  const alpha = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) alpha[y * w + x] = result.data[((sy + y) * result.width + sx + x) * 4 + 3];
  }
  return neatSvg(traceNeat(alpha, w, h), 0, 0, w, h);
}

const svgImage = (svg) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
});

// Photo in, clean line drawing out. Finds the sheet of paper in the photo,
// straightens it, and turns it into line art. The four yellow dots mark the
// paper's corners and can be dragged; two sliders fix up the lines. "Real
// Photo" shows the straightened photo as it is instead.
export default function PhotoImport({ file, kind = 'card', onCancel, onDone }) {
  const [bitmap, setBitmap] = useState(null);
  const [failed, setFailed] = useState(false);
  const [turns, setTurns] = useState(0);
  const [source, setSource] = useState(null);
  const [corners, setCorners] = useState(FULL_FRAME); // fractions of the photo
  const [found, setFound] = useState(null); // did the app find the paper by itself? null = not looked yet
  const [darkness, setDarkness] = useState(65);
  const [smudge, setSmudge] = useState(30);
  // A character card is usually one figure; a comic panel needs everything kept.
  const [justFigure, setJustFigure] = useState(kind === 'card');
  const [neat, setNeat] = useState(true);
  const [readWords, setReadWords] = useState(kind === 'card');
  const [realPhoto, setRealPhoto] = useState(false);
  const [problem, setProblem] = useState(null); // 'empty' | 'corners'
  const [busy, setBusy] = useState(false);
  const photoRef = useRef(null);
  const quadRef = useRef(null);
  const cleanRef = useRef(null);
  const flat = useRef(null); // { source, key, pixels }: the straightened photo for the current corners
  const cleaned = useRef(null);

  useEffect(() => {
    let alive = true;
    loadBitmap(file).then((b) => { if (alive) setBitmap(b); }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [file]);

  const findPaper = (src) => {
    const auto = detectPage(toSmallGray(src.pixels));
    setCorners(auto || FULL_FRAME);
    setFound(Boolean(auto));
  };

  // A new photo, or the same one turned: prepare it and look for the paper.
  useEffect(() => {
    if (!bitmap) return;
    const src = makeSource(bitmap, turns);
    setSource(src);
    findPaper(src);
  }, [bitmap, turns]);

  // Show the photo.
  useEffect(() => {
    const canvas = photoRef.current;
    if (!canvas || !source) return;
    const k = Math.min(1, VIEW_SIDE / Math.max(source.w, source.h));
    canvas.width = Math.round(source.w * k);
    canvas.height = Math.round(source.h * k);
    canvas.getContext('2d').drawImage(source.canvas, 0, 0, canvas.width, canvas.height);
  }, [source]);

  // Straighten and clean. Held back a moment so dragging stays smooth.
  useEffect(() => {
    if (!source) return undefined;
    const timer = setTimeout(() => {
      const key = corners.flat().join(',');
      if (!flat.current || flat.current.source !== source || flat.current.key !== key) {
        const px = corners.map(([x, y]) => [x * source.w, y * source.h]);
        const size = straightSize(px, OUT_SIDE);
        flat.current = { source, key, pixels: straighten(source.pixels, px, size.width, size.height) };
      }
      const straight = flat.current.pixels;
      if (!straight) { cleaned.current = null; setProblem('corners'); return; }
      const raw = cleanLineArt(straight, { darkness, smudge });
      const result = justFigure && raw.bbox ? onlyFigure(raw) : raw;
      const svg = neat && result.bbox ? neatFor(result) : null;
      cleaned.current = { ...result, svg, raw, figure: justFigure ? result : null };
      setProblem(result.bbox ? null : 'empty');
      const canvas = cleanRef.current;
      if (!canvas) return;
      canvas.width = result.width;
      canvas.height = result.height;
      const ctx = canvas.getContext('2d');
      if (realPhoto) { ctx.putImageData(new ImageData(straight.data, straight.width, straight.height), 0, 0); return; }
      if (!svg) { ctx.putImageData(new ImageData(result.data, result.width, result.height), 0, 0); return; }
      const { sx, sy } = cropBox(result);
      svgImage(svg).then((img) => {
        if (cleaned.current?.svg !== svg) return; // something changed meanwhile
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, sx, sy);
      });
    }, 140);
    return () => clearTimeout(timer);
  }, [source, corners, darkness, smudge, justFigure, neat, realPhoto]);

  const moveCorner = (index, x, y) => {
    setCorners((cs) => cs.map((c, i) => (i === index ? [clamp01(x), clamp01(y)] : c)));
  };
  const cornerHandlers = (index) => ({
    onPointerDown: (e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); },
    onPointerMove: (e) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      const r = quadRef.current.getBoundingClientRect();
      moveCorner(index, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    },
    onKeyDown: (e) => {
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!step) return;
      e.preventDefault();
      moveCorner(index, corners[index][0] + step[0] * 0.005, corners[index][1] + step[1] * 0.005);
    },
  });

  const finish = async () => {
    const result = cleaned.current;
    if (!result || (!result.bbox && !realPhoto)) return;
    setBusy(true);
    const sheet = sheetPhoto(flat.current.pixels);
    // Reading takes a few seconds, so it starts now and finishes on the page.
    const words = kind === 'card' && readWords ? sheet.then(readMyWords) : null;
    // Every version is made now, so Ada can switch on the page later: pencil or
    // neat lines, each with everything or just the character, and the photo as
    // it is. When nothing is around the character those two are the same, and
    // only one is kept; when no lines were found there is only the photo.
    const { raw, svg } = result;
    const figure = result.figure || onlyFigure(raw);
    const both = Boolean(figure.bbox) && inkOf(figure) < inkOf(raw);
    const shownSource = justFigure ? figure : raw;
    const versions = [];
    for (const [res, isFigure] of !raw.bbox ? [] : both ? [[raw, false], [figure, true]] : [[raw, false]]) {
      const { sx, sy, w, h } = cropBox(res);
      const pencil = document.createElement('canvas');
      pencil.width = w;
      pencil.height = h;
      pencil.getContext('2d').putImageData(new ImageData(res.data, res.width, res.height), -sx, -sy);
      const lines = (res === shownSource && svg) || neatFor(res);
      const tidy = document.createElement('canvas');
      tidy.width = w;
      tidy.height = h;
      tidy.getContext('2d').drawImage(await svgImage(lines), 0, 0, w, h);
      const [pencilBlob, neatBlob] = await Promise.all([toBlob(pencil, 'image/png'), toBlob(tidy, 'image/png')]);
      const box = { x: sx, y: sy, w, h };
      versions.push(
        { neat: false, figure: isFigure, blob: pencilBlob, box },
        { neat: true, figure: isFigure, blob: neatBlob, vecBlob: new Blob([lines], { type: 'image/svg+xml' }), box },
      );
    }
    versions.push({ photo: true, blob: await sheet, box: { x: 0, y: 0, w: raw.width, h: raw.height } });
    const origBlob = await toBlob(source.canvas, 'image/jpeg', 0.85);
    await onDone({ versions, look: { neat, figure: both && justFigure, photo: realPhoto }, origBlob, words });
  };

  const stuck = problem === 'corners' || (problem === 'empty' && !realPhoto);
  const aspect = source ? source.w / source.h : 4 / 3;
  const points = corners.map(([x, y]) => `${x * 100},${y * 100}`).join(' ');

  return (
    <div className="gn-modal" role="dialog" aria-modal="true" aria-label="Clean up your photo">
      <div className="gn-modal-card">
        <div className="gn-modal-head">
          <h2 className="gn-h2">Clean Up Your Photo</h2>
          <button className="gn-btn" onClick={onCancel}><Icon name="close" /> Cancel</button>
        </div>

        {failed ? (
          <p className="gn-hint-big">I can't open that picture. Try a different one.</p>
        ) : (
          <div className="gn-import">
            <section className="gn-import-pane">
              <h3 className="gn-h3">Your Photo</h3>
              <div className="gn-import-view gn-import-photo">
                <div ref={quadRef} className="gn-quad"
                  style={{ aspectRatio: String(aspect), width: `min(100%, calc((56vh - 52px) * ${aspect}))` }}>
                  <canvas ref={photoRef} />
                  {source && (
                    <>
                      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                        <path className="gn-quad-shade" fillRule="evenodd" d={`M0 0H100V100H0Z M${points.replace(/ /g, ' L')}Z`} />
                        <polygon className="gn-quad-line" points={points} />
                      </svg>
                      {corners.map(([x, y], i) => (
                        <button key={CORNER_NAMES[i]} className="gn-corner" aria-label={CORNER_NAMES[i]}
                          style={{ left: `${x * 100}%`, top: `${y * 100}%` }} {...cornerHandlers(i)} />
                      ))}
                    </>
                  )}
                </div>
              </div>
              <p className="gn-note">
                {found === true && 'I found your paper! If a corner is wrong, drag its yellow dot.'}
                {found === false && 'Drag the yellow dots to the corners of your paper.'}
              </p>
            </section>
            <section className="gn-import-pane">
              <h3 className="gn-h3 gn-accent-text">{realPhoto ? 'Real Photo' : 'Cleaned Up'}</h3>
              <div className="gn-import-view"><canvas ref={cleanRef} /></div>
              <p className="gn-note">
                {realPhoto && 'Your photo as it is, just straightened.'}
                {!realPhoto && (neat ? 'Neat lines: your drawing, traced with a smooth pen.' : 'Straight, white paper, your pencil lines.')}
                {!realPhoto && justFigure && ' Things around your character are left out.'}
              </p>
            </section>
            <section className="gn-import-tools">
              <div className="gn-grid2">
                <button className="gn-btn gn-btn-small" disabled={!source} onClick={() => findPaper(source)}>Find My Paper</button>
                <button className="gn-btn gn-btn-small" disabled={!source}
                  onClick={() => { setCorners(FULL_FRAME); setFound(false); }}>Whole Photo</button>
              </div>
              <button className="gn-btn" onClick={() => setTurns((t) => (t + 1) % 4)}>
                <Icon name="rotate" /> Turn It
              </button>
              <div className="gn-grid2">
                <button className="gn-btn gn-btn-small gn-toggle" aria-pressed={justFigure} disabled={realPhoto}
                  onClick={() => setJustFigure((v) => !v)}>Just My Character</button>
                <button className="gn-btn gn-btn-small gn-toggle" aria-pressed={neat} disabled={realPhoto}
                  onClick={() => setNeat((v) => !v)}><Icon name="pen" /> Neat Lines</button>
              </div>
              <button className="gn-btn gn-btn-small gn-toggle" aria-pressed={realPhoto}
                onClick={() => setRealPhoto((v) => !v)}><Icon name="camera" /> Real Photo</button>
              {kind === 'card' && (
                <button className="gn-btn gn-btn-small gn-toggle" aria-pressed={readWords}
                  onClick={() => setReadWords((v) => !v)}>Read My Words</button>
              )}
              <div className="gn-field">
                <label className="gn-label-strong" htmlFor="gn-dark">Line darkness</label>
                <input id="gn-dark" type="range" min="0" max="100" value={darkness} disabled={realPhoto}
                  onChange={(e) => setDarkness(Number(e.target.value))} />
                <div className="gn-range-ends"><span>Lighter</span><span>Darker</span></div>
              </div>
              <div className="gn-field">
                <label className="gn-label-strong" htmlFor="gn-smudge">Erase smudges</label>
                <input id="gn-smudge" type="range" min="0" max="100" value={smudge} disabled={realPhoto}
                  onChange={(e) => setSmudge(Number(e.target.value))} />
                <div className="gn-range-ends"><span>Keep all</span><span>Erase more</span></div>
              </div>
              <p className="gn-note">Your real photo is always kept safe.</p>
              {stuck && problem === 'empty' && <p className="gn-note gn-note-warn">I can't see any lines yet. Try making them darker, or use Real Photo.</p>}
              {problem === 'corners' && <p className="gn-note gn-note-warn">Those dots don't make a page. Move them to the four corners.</p>}
              <button className="gn-btn gn-btn-primary gn-btn-big gn-push-down" disabled={!source || stuck || busy}
                onClick={finish}>
                {busy ? 'Working...' : 'Looks Good!'} <Icon name="arrow" />
              </button>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
