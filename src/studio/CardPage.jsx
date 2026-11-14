import Drawing from './Drawing.jsx';
import EditableText from './EditableText.jsx';
import Icon from './Icon.jsx';
import { PAGE_H, PAGE_W, partStyle } from './model.js';

// A character card: name on top, the drawing in the middle, two text boxes on
// each side. Drawn at a fixed 900x636 and scaled by whoever shows it.
export default function CardPage({ page, selected, readOnly, onSelect, onText, onAddPhoto, onDraw }) {
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
    <div className="gn-page gn-card" style={{ width: PAGE_W, height: PAGE_H }}>
      <div className={`gn-name${isSel('name') ? ' is-selected' : ''}`}>
        {text('name', page.name, 'name', { placeholder: 'NAME', label: 'Character name', singleLine: true })}
      </div>
      <div className="gn-card-grid">
        <div className="gn-card-col">{page.boxes.slice(0, 2).map(box)}</div>
        <div className="gn-portrait">
          {page.image && <Drawing image={page.image} />}
          {!page.image && !readOnly && (
            <div className="gn-portrait-empty">
              <button className="gn-portrait-add" onClick={onAddPhoto}>
                <Icon name="camera" size={40} />
                Add your drawing
              </button>
              <button className="gn-portrait-draw" onClick={onDraw}><Icon name="pen" size={20} /> Draw it here</button>
            </div>
          )}
        </div>
        <div className="gn-card-col">{page.boxes.slice(2, 4).map(box)}</div>
      </div>
    </div>
  );
}
