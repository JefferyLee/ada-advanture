import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { cleanLineArt } from './cleanup.js';
import { FULL_FRAME, detectPage, straightSize, straighten, toSmallGray } from './perspective.js';

const SOURCE_SIDE = 2200; // the photo is shrunk to this before anything else
const OUT_SIDE = 1500; // longest side of the straightened, cleaned drawing
const VIEW_SIDE = 1200; // longest side of the photo as shown on screen
const MARGIN = 12; // blank space kept around the trimmed drawing

const CORNER_NAMES = ['Top left corner', 'Top right corner', 'Bottom right corner', 'Bottom left corner'];
const clamp01 = (v) => Math.min(1, Math.max(0, v));

async function loadBitmap(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

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

// Photo in, clean line drawing out. Finds the sheet of paper in the photo,
// straightens it, and turns it into line art. The four yellow dots mark the
// paper's corners and can be dragged; two sliders fix up the lines.
export default function PhotoImport({ file, onCancel, onDone }) {
  const [bitmap, setBitmap] = useState(null);
  const [failed, setFailed] = useState(false);
  const [turns, setTurns] = useState(0);
  const [source, setSource] = useState(null);
  const [corners, setCorners] = useState(FULL_FRAME); // fractions of the photo
  const [found, setFound] = useState(null); // did the app find the paper by itself? null = not looked yet
  const [darkness, setDarkness] = useState(65);
  const [smudge, setSmudge] = useState(30);
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
      const result = cleanLineArt(straight, { darkness, smudge });
      cleaned.current = result;
      setProblem(result.bbox ? null : 'empty');
      const canvas = cleanRef.current;
      if (!canvas) return;
      canvas.width = result.width;
      canvas.height = result.height;
      canvas.getContext('2d').putImageData(new ImageData(result.data, result.width, result.height), 0, 0);
    }, 140);
    return () => clearTimeout(timer);
  }, [source, corners, darkness, smudge]);

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
    if (!result?.bbox) return;
    setBusy(true);
    const { x0, y0, x1, y1 } = result.bbox;
    const sx = Math.max(0, x0 - MARGIN);
    const sy = Math.max(0, y0 - MARGIN);
    const w = Math.min(result.width, x1 + 1 + MARGIN) - sx;
    const h = Math.min(result.height, y1 + 1 + MARGIN) - sy;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    out.getContext('2d').putImageData(new ImageData(result.data, result.width, result.height), -sx, -sy);
    const [blob, origBlob] = await Promise.all([toBlob(out, 'image/png'), toBlob(source.canvas, 'image/jpeg', 0.85)]);
    await onDone({ blob, origBlob, w, h });
  };

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
              <h3 className="gn-h3 gn-accent-text">Cleaned Up</h3>
              <div className="gn-import-view"><canvas ref={cleanRef} /></div>
              <p className="gn-note">Straight, white paper, dark lines.</p>
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
              <div className="gn-field">
                <label className="gn-label-strong" htmlFor="gn-dark">Line darkness</label>
                <input id="gn-dark" type="range" min="0" max="100" value={darkness}
                  onChange={(e) => setDarkness(Number(e.target.value))} />
                <div className="gn-range-ends"><span>Lighter</span><span>Darker</span></div>
              </div>
              <div className="gn-field">
                <label className="gn-label-strong" htmlFor="gn-smudge">Erase smudges</label>
                <input id="gn-smudge" type="range" min="0" max="100" value={smudge}
                  onChange={(e) => setSmudge(Number(e.target.value))} />
                <div className="gn-range-ends"><span>Keep all</span><span>Erase more</span></div>
              </div>
              <p className="gn-note">Your real photo is always kept safe.</p>
              {problem === 'empty' && <p className="gn-note gn-note-warn">I can't see any lines yet. Try making them darker.</p>}
              {problem === 'corners' && <p className="gn-note gn-note-warn">Those dots don't make a page. Move them to the four corners.</p>}
              <button className="gn-btn gn-btn-primary gn-btn-big gn-push-down" disabled={!source || Boolean(problem) || busy}
                onClick={finish}>
                Looks Good! <Icon name="arrow" />
              </button>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
