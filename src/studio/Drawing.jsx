import { useEffect, useId, useState } from 'react';
import { drawingBox, strokePath } from './model.js';
import { imageUrl } from './store.js';

export function useStoredImage(id) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (id) imageUrl(id).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [id]);
  return url;
}

// The line art with Ada's pen and eraser strokes, as SVG in the coordinates of
// the straightened photo. An eraser stroke rubs out everything drawn before it,
// her pencil lines too, so each run of them masks what came before.
function DrawnInk({ image, ink }) {
  const box = drawingBox(image);
  const uid = useId().replace(/:/g, '');
  const masks = [];
  let content = ink ? <image href={ink} x={box.x} y={box.y} width={box.w} height={box.h} /> : null;
  let rubs = [];
  const rubOut = () => {
    if (!rubs.length) return;
    const id = `${uid}-rub${masks.length}`;
    masks.push(
      <mask key={id} id={id} maskUnits="userSpaceOnUse" x={box.x} y={box.y} width={box.w} height={box.h}>
        <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="#fff" />
        {rubs}
      </mask>,
    );
    content = <g mask={`url(#${id})`}>{content}</g>;
    rubs = [];
  };
  image.edits.forEach((e, k) => {
    const path = <path key={k} d={strokePath(e.points)} stroke={e.erase ? '#000' : e.color} strokeWidth={e.size} />;
    if (e.erase) {
      rubs.push(path);
    } else {
      rubOut();
      content = <>{content}{path}</>;
    }
  });
  rubOut();
  return (
    <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} role="img" aria-label="Your drawing"
      fill="none" strokeLinecap="round" strokeLinejoin="round">
      <defs>{masks}</defs>
      {content}
    </svg>
  );
}

// One of Ada's drawings: the line art, with its color layer underneath when
// she has colored it. Both pictures are the same size, so they line up. Neat
// lines are shown from their SVG, so they stay sharp at any size.
export default function Drawing({ image }) {
  const ink = useStoredImage(image.vecId || image.id);
  const color = useStoredImage(image.colorId);
  const drawn = image.edits?.length > 0;
  return (
    <div className="gn-drawing">
      {color && <img src={color} alt="" />}
      {drawn ? <DrawnInk image={image} ink={ink} /> : ink && <img src={ink} alt="Your drawing" />}
    </div>
  );
}
