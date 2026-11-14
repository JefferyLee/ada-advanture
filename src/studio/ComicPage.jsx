import { useLayoutEffect, useRef, useState } from 'react';
import Drawing from './Drawing.jsx';
import EditableText from './EditableText.jsx';
import Icon from './Icon.jsx';
import { INNER_H, INNER_W, PAGE_H, PAGE_W, newId, panelRects, partStyle, strokePath } from './model.js';

const PLACEHOLDER = { speech: 'Say something', thought: 'Think something', caption: 'Meanwhile...', sound: 'POW!' };
const LABEL = { speech: 'Speech bubble', thought: 'Thought bubble', caption: 'Caption', sound: 'Sound word' };

const round = (v) => Math.round(v * 10) / 10;

// Screen position -> page position, whatever the page is scaled to.
function toPage(event, el) {
  const r = el.getBoundingClientRect();
  return [((event.clientX - r.left) * INNER_W) / r.width, ((event.clientY - r.top) * INNER_H) / r.height];
}

// The pen layer: every stroke drawn on the page, plus the one being drawn.
function InkLayer({ strokes, tool, pen, onAdd, onErase }) {
  const svgRef = useRef(null);
  const liveRef = useRef(null);
  const gesture = useRef(null);
  const penSeen = useRef(false);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const active = tool === 'pen' || tool === 'eraser';

  // The line being drawn is cleared once the saved stroke has taken its place.
  useLayoutEffect(() => { liveRef.current?.setAttribute('d', ''); }, [strokes]);

  const eraseAt = (x, y, g) => {
    for (const s of strokesRef.current) {
      if (g.erased.has(s.id)) continue;
      const reach = s.size / 2 + 8;
      for (let i = 0; i < s.points.length; i += 2) {
        if (Math.hypot(s.points[i] - x, s.points[i + 1] - y) <= reach) {
          g.erased.add(s.id);
          onErase(s.id, g.key);
          break;
        }
      }
    }
  };

  const down = (e) => {
    if (!active || gesture.current) return;
    if (e.pointerType === 'pen') penSeen.current = true;
    // Once an Apple Pencil has been used, a finger or palm doesn't draw.
    if (e.pointerType === 'touch' && penSeen.current) return;
    e.preventDefault();
    svgRef.current.setPointerCapture(e.pointerId);
    const [x, y] = toPage(e, svgRef.current);
    const g = { pointer: e.pointerId, points: [round(x), round(y)], erased: new Set(), key: `erase:${newId()}` };
    gesture.current = g;
    if (tool === 'eraser') eraseAt(x, y, g);
    else liveRef.current.setAttribute('d', strokePath(g.points));
  };

  const move = (e) => {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    const batch = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const ev of batch.length ? batch : [e.nativeEvent]) {
      const [x, y] = toPage(ev, svgRef.current);
      if (tool === 'eraser') { eraseAt(x, y, g); continue; }
      const p = g.points;
      if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) >= 1.5) p.push(round(x), round(y));
    }
    if (tool === 'pen') liveRef.current.setAttribute('d', strokePath(g.points));
  };

  const up = (e) => {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    gesture.current = null;
    if (tool === 'pen') onAdd({ id: newId(), color: pen.color, size: pen.size, points: g.points });
  };

  return (
    <svg ref={svgRef} className={`gn-ink${active ? ' is-active' : ''}`} viewBox={`0 0 ${INNER_W} ${INNER_H}`}
      aria-hidden="true" fill="none" strokeLinecap="round" strokeLinejoin="round"
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {strokes.map((s) => <path key={s.id} d={strokePath(s.points)} stroke={s.color} strokeWidth={s.size} />)}
      <path ref={liveRef} stroke={pen.color} strokeWidth={pen.size} />
    </svg>
  );
}

// A bubble, caption or sound word. Type in it; drag the handles to move it or
// change its width.
function ComicItem({ item, selected, readOnly, autoFocus, onSelect, onText, onChange, onDelete }) {
  const [live, setLive] = useState(null); // position while a handle is being dragged
  const drag = useRef(null);
  const shown = live || item;
  const target = `item:${item.id}`;

  const start = (mode) => (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const inner = e.currentTarget.closest('.gn-comic-inner').getBoundingClientRect();
    drag.current = { mode, x0: e.clientX, y0: e.clientY, k: INNER_W / inner.width };
  };
  const moveHandle = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x0) * d.k;
    const dy = (e.clientY - d.y0) * d.k;
    if (d.mode === 'size') {
      setLive({ x: item.x, y: item.y, w: Math.round(Math.max(90, Math.min(520, item.w + dx))) });
    } else {
      setLive({
        x: Math.round(Math.max(-20, Math.min(INNER_W - 40, item.x + dx))),
        y: Math.round(Math.max(-10, Math.min(INNER_H - 30, item.y + dy))),
        w: item.w,
      });
    }
  };
  const end = () => {
    if (!drag.current) return;
    drag.current = null;
    if (live) onChange(item.id, live);
    setLive(null);
  };
  const handle = (mode) => ({ onPointerDown: start(mode), onPointerMove: moveHandle, onPointerUp: end, onPointerCancel: end });

  return (
    <div className={`gn-item gn-item-${item.kind}${selected ? ' is-selected' : ''}`}
      style={{ left: shown.x, top: shown.y, width: item.kind === 'sound' ? 'max-content' : shown.w }}>
      <EditableText
        value={item.text}
        style={partStyle(item, item.kind === 'sound' ? 'sound' : 'bubble')}
        placeholder={PLACEHOLDER[item.kind]}
        label={LABEL[item.kind]}
        singleLine={item.kind === 'sound'}
        readOnly={readOnly}
        autoFocus={autoFocus}
        onFocus={() => onSelect(target)}
        onChange={(t) => onText(target, t)}
      />
      {selected && !readOnly && (
        <>
          <button className="gn-handle gn-handle-move" aria-label="Move" {...handle('move')}><Icon name="move" size={18} /></button>
          <button className="gn-handle gn-handle-delete" aria-label="Delete" onClick={() => onDelete(item.id)}><Icon name="close" size={18} stroke={3} /></button>
          {item.kind !== 'sound' && (
            <button className="gn-handle gn-handle-size" aria-label="Make wider or narrower" {...handle('size')}><Icon name="width" size={18} /></button>
          )}
        </>
      )}
    </div>
  );
}

// A comic page: panels that can hold a photographed drawing, pen strokes
// drawn over the page, and bubbles on top.
export default function ComicPage({
  page, selected, tool = 'move', pen, readOnly, focusItem,
  onSelect, onText, onAddPhoto, onDraw, onAddStroke, onEraseStroke, onChangeItem, onDeleteItem,
}) {
  const rects = panelRects(page.layout);
  const drawingMode = !readOnly && (tool === 'pen' || tool === 'eraser');

  return (
    <div className={`gn-page gn-comic${drawingMode ? ' is-drawing' : ''}`} style={{ width: PAGE_W, height: PAGE_H }}>
      <div className="gn-comic-inner">
        {rects.map((r, i) => {
          const panel = page.panels[i];
          const target = `panel:${panel.id}`;
          return (
            <div key={panel.id} className={`gn-cell${!readOnly && selected === target ? ' is-selected' : ''}`}
              style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
              onClick={() => { if (!readOnly) onSelect(target); }}>
              {panel.image && <Drawing image={panel.image} />}
              {!panel.image && !readOnly && tool === 'move' && (
                <div className="gn-cell-adds">
                  <button className="gn-cell-add" onClick={(e) => { e.stopPropagation(); onSelect(target); onAddPhoto(target); }}>
                    <Icon name="camera" size={20} /> Photo
                  </button>
                  <button className="gn-cell-add" onClick={(e) => { e.stopPropagation(); onSelect(target); onDraw(target); }}>
                    <Icon name="pen" size={20} /> Draw
                  </button>
                </div>
              )}
            </div>
          );
        })}
        <InkLayer strokes={page.strokes} tool={readOnly ? 'move' : tool} pen={pen || { color: '#1B1B2F', size: 6 }}
          onAdd={onAddStroke} onErase={onEraseStroke} />
        {page.items.map((item) => (
          <ComicItem key={item.id} item={item} readOnly={readOnly}
            selected={!readOnly && selected === `item:${item.id}`} autoFocus={focusItem === item.id}
            onSelect={onSelect} onText={onText} onChange={onChangeItem} onDelete={onDeleteItem} />
        ))}
      </div>
    </div>
  );
}
