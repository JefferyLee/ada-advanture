import { useEffect, useState } from 'react';
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

// One of Ada's drawings: the line art, with its color layer underneath when
// she has colored it. Both pictures are the same size, so they line up.
export default function Drawing({ image }) {
  const ink = useStoredImage(image.id);
  const color = useStoredImage(image.colorId);
  return (
    <div className="gn-drawing">
      {color && <img src={color} alt="" />}
      {ink && <img src={ink} alt="Your drawing" />}
    </div>
  );
}
