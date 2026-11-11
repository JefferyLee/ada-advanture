import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { cleanLineArt } from './cleanup.js';

const MAX_SIDE = 1500; // photos are shrunk to this before cleaning
const MARGIN = 12; // blank space kept around the trimmed drawing

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

function drawSource(bitmap, quarterTurns) {
  const bw = bitmap.width;
  const bh = bitmap.height;
  const k = Math.min(1, MAX_SIDE / Math.max(bw, bh));
  const w = Math.round(bw * k);
  const h = Math.round(bh * k);
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
  return canvas;
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

// Photo in, clean line drawing out. Shows the photo next to the cleaned-up
// version, with two sliders to fix it up.
export default function PhotoImport({ file, onCancel, onDone }) {
  const [bitmap, setBitmap] = useState(null);
  const [failed, setFailed] = useState(false);
  const [turns, setTurns] = useState(0);
  const [darkness, setDarkness] = useState(65);
  const [smudge, setSmudge] = useState(30);
  const [empty, setEmpty] = useState(false);
  const [busy, setBusy] = useState(false);
  const photoRef = useRef(null);
  const cleanRef = useRef(null);
  const work = useRef(null); // { source, cleaned } from the latest run

  useEffect(() => {
    let alive = true;
    loadBitmap(file).then((b) => { if (alive) setBitmap(b); }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [file]);

  useEffect(() => {
    if (!bitmap) return undefined;
    const timer = setTimeout(() => {
      const source = drawSource(bitmap, turns);
      const { width, height } = source;
      const cleaned = cleanLineArt(
        source.getContext('2d').getImageData(0, 0, width, height),
        { darkness, smudge },
      );
      work.current = { source, cleaned };
      setEmpty(!cleaned.bbox);
      for (const [ref, paint] of [
        [photoRef, (ctx) => ctx.drawImage(source, 0, 0)],
        [cleanRef, (ctx) => ctx.putImageData(new ImageData(cleaned.data, width, height), 0, 0)],
      ]) {
        const canvas = ref.current;
        if (!canvas) continue;
        canvas.width = width;
        canvas.height = height;
        paint(canvas.getContext('2d'));
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [bitmap, turns, darkness, smudge]);

  const finish = async () => {
    const { source, cleaned } = work.current || {};
    if (!cleaned?.bbox) return;
    setBusy(true);
    const { x0, y0, x1, y1 } = cleaned.bbox;
    const sx = Math.max(0, x0 - MARGIN);
    const sy = Math.max(0, y0 - MARGIN);
    const w = Math.min(cleaned.width, x1 + 1 + MARGIN) - sx;
    const h = Math.min(cleaned.height, y1 + 1 + MARGIN) - sy;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    out.getContext('2d').putImageData(new ImageData(cleaned.data, cleaned.width, cleaned.height), -sx, -sy);
    const [blob, origBlob] = await Promise.all([toBlob(out, 'image/png'), toBlob(source, 'image/jpeg', 0.85)]);
    await onDone({ blob, origBlob, w, h });
  };

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
              <div className="gn-import-view gn-import-photo"><canvas ref={photoRef} /></div>
            </section>
            <section className="gn-import-pane">
              <h3 className="gn-h3 gn-accent-text">Cleaned Up</h3>
              <div className="gn-import-view"><canvas ref={cleanRef} /></div>
            </section>
            <section className="gn-import-tools">
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
              <button className="gn-btn" onClick={() => setTurns((t) => (t + 1) % 4)}>
                <Icon name="rotate" /> Turn It
              </button>
              <p className="gn-note">Your real photo is always kept safe.</p>
              {empty && <p className="gn-note gn-note-warn">I can't see any lines yet. Try making them darker.</p>}
              <button className="gn-btn gn-btn-primary gn-btn-big gn-push-down" disabled={!bitmap || empty || busy}
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
