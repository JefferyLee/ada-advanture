import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { PAGE_H, PAGE_W, partStyle } from './model.js';
import { imageUrl } from './store.js';

// One piece of editable text on the page. The browser owns the text while the
// child is typing; React only writes into it when the value changes from
// somewhere else (undo, the helper), so the cursor never jumps.
function EditableText({ value, style, placeholder, label, singleLine, readOnly, onChange, onFocus }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.textContent !== value) el.textContent = value;
  }, [value]);

  if (readOnly) return <div className="gn-text" style={style}>{value}</div>;

  return (
    <div
      ref={ref}
      className="gn-text"
      style={style}
      role="textbox"
      aria-label={label}
      aria-multiline={!singleLine}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onFocus={onFocus}
      onKeyDown={(e) => { if (singleLine && e.key === 'Enter') e.preventDefault(); }}
      onInput={(e) => {
        const el = e.currentTarget;
        let text = el.textContent;
        // Browsers leave a lone line break behind when everything is deleted.
        if (text === '\n') { text = ''; el.textContent = ''; }
        onChange(text);
      }}
    />
  );
}

function useStoredImage(id) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (id) imageUrl(id).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [id]);
  return url;
}

// A character card: name on top, the drawing in the middle, two text boxes on
// each side. Drawn at a fixed 900x636 and scaled by whoever shows it.
export default function CardPage({ page, selected, readOnly, onSelect, onText, onAddPhoto }) {
  const url = useStoredImage(page.image?.id);
  const isSel = (target) => !readOnly && selected === target;

  const text = (target, p, role, extra) => (
    <EditableText
      value={p.text}
      style={partStyle(p, role)}
      readOnly={readOnly}
      onFocus={() => onSelect(target)}
      onChange={(t) => onText(target, t)}
      {...extra}
    />
  );

  const box = (b) => {
    const selectedHere = isSel(`${b.id}.title`) || isSel(`${b.id}.body`);
    return (
      <div key={b.id} className={`gn-box gn-box-${b.boxStyle}${selectedHere ? ' is-selected' : ''}`}>
        <div className="gn-box-title">
          {text(`${b.id}.title`, b.title, 'title', { placeholder: 'Title', label: 'Box title', singleLine: true })}
        </div>
        {text(`${b.id}.body`, b.body, 'body', { placeholder: 'Type here', label: `${b.title.text || 'Box'} text` })}
      </div>
    );
  };

  return (
    <div className="gn-page" style={{ width: PAGE_W, height: PAGE_H }}>
      <div className={`gn-name${isSel('name') ? ' is-selected' : ''}`}>
        {text('name', page.name, 'name', { placeholder: 'NAME', label: 'Character name', singleLine: true })}
      </div>
      <div className="gn-card-grid">
        <div className="gn-card-col">{page.boxes.slice(0, 2).map(box)}</div>
        <div className="gn-portrait">
          {url && <img src={url} alt="Your drawing" />}
          {!page.image && !readOnly && (
            <button className="gn-portrait-empty" onClick={onAddPhoto}>
              <Icon name="camera" size={40} />
              Add your drawing
            </button>
          )}
        </div>
        <div className="gn-card-col">{page.boxes.slice(2, 4).map(box)}</div>
      </div>
    </div>
  );
}
