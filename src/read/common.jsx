import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PAGE_H, PAGE_W } from '../studio/model.js';

// Pieces shared by the public pages (Ada's comics and Ada's blog), which
// anyone can see without the PIN. They only read what Ada has published.

// Public pictures need no PIN; anything not in a published episode is 404.
export const publicImage = (id) => Promise.resolve(`/api/public/images/${id}`);

export async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

// The top of a public page, with the way back to the home page.
export function Header({ title }) {
  return (
    <header className="rd-header">
      <a className="rd-home" href="/">🏠 Home</a>
      <span className="rd-sep" aria-hidden="true">›</span>
      <h1 className="rd-title">{title}</h1>
    </header>
  );
}

// A heart with the number of likes. Each visitor can like a thing once; this
// device remembers it, and the server counts each visitor once anyway.
export function LikeButton({ id, likes }) {
  const key = `liked:${id}`;
  const [count, setCount] = useState(likes);
  const [liked, setLiked] = useState(() => { try { return localStorage.getItem(key) === '1'; } catch { return false; } });
  useEffect(() => setCount(likes), [likes]);
  const like = async () => {
    if (liked) return;
    setLiked(true);
    setCount((n) => n + 1);
    try { localStorage.setItem(key, '1'); } catch { /* fine: the server still counts each visitor once */ }
    try {
      const res = await fetch(`/api/public/likes/${id}`, { method: 'POST' });
      if (res.ok) setCount((await res.json()).likes);
    } catch { /* the heart stays filled; the count catches up next time */ }
  };
  return (
    <button className={`rd-like${liked ? ' is-liked' : ''}`} onClick={like} aria-pressed={liked}
      aria-label={liked ? `You liked this. ${count} likes` : `Like this. ${count} likes`}>
      <span aria-hidden="true">{liked ? '♥' : '♡'}</span> {count}
    </button>
  );
}

// A studio page (always 900x636) shrunk to the width it is given.
export function ScaledPage({ children }) {
  const ref = useRef(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    const fit = () => setScale(el.clientWidth / PAGE_W);
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  return (
    <div ref={ref} className="rd-page" style={{ height: PAGE_H * scale }}>
      <div style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${scale})`, transformOrigin: '0 0' }}>{children}</div>
    </div>
  );
}
