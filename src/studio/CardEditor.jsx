import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import CardPage from './CardPage.jsx';
import HelperBar from './HelperBar.jsx';
import Icon from './Icon.jsx';
import PhotoImport from './PhotoImport.jsx';
import {
  BOX_STYLES, COLORS, FONTS, PAGE_H, PAGE_W, SIZES,
  applyActions, describePage, getPart, newCardPage, newId, pageLabel, roleOf,
} from './model.js';
import { putImage } from './store.js';

// Undo/redo over whole-book snapshots. A change made with the same `key` as
// the one before it (typing in one box) replaces it instead of adding a step.
function useHistory(initial, onChange) {
  const [h, setH] = useState({ past: [], present: initial, future: [], lastKey: null });
  const presentRef = useRef(initial);
  presentRef.current = h.present;

  const commit = useCallback((next, key = null) => {
    presentRef.current = next;
    setH((prev) => ({
      past: key !== null && key === prev.lastKey ? prev.past : [...prev.past, prev.present].slice(-100),
      present: next,
      future: [],
      lastKey: key,
    }));
  }, []);

  const update = useCallback((mutate, key = null) => {
    const next = structuredClone(presentRef.current);
    mutate(next);
    next.updatedAt = Date.now();
    commit(next, key);
    return next;
  }, [commit]);

  const undo = useCallback(() => setH((prev) => (prev.past.length ? {
    past: prev.past.slice(0, -1),
    present: prev.past[prev.past.length - 1],
    future: [prev.present, ...prev.future],
    lastKey: null,
  } : prev)), []);

  const redo = useCallback(() => setH((prev) => (prev.future.length ? {
    past: [...prev.past, prev.present],
    present: prev.future[0],
    future: prev.future.slice(1),
    lastKey: null,
  } : prev)), []);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    onChange(h.present);
  }, [h.present, onChange]);

  const current = useCallback(() => presentRef.current, []);

  return {
    book: h.present, current, commit, update, undo, redo,
    canUndo: h.past.length > 0, canRedo: h.future.length > 0,
  };
}

// Largest scale at which the page fits inside the stage.
function useFitScale(ref) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setScale(Math.max(0.3, Math.min(1.8, (r.width - 48) / PAGE_W, (r.height - 48) / PAGE_H)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return scale;
}

const SIZE_LABELS = { s: 'S', m: 'M', l: 'L', xl: 'XL' };
const BOX_LABELS = { none: 'None', box: 'Box', banner: 'Banner' };

function StylePanel({ page, selected, onStyle, onBoxStyle, onAddPhoto, onRemovePhoto }) {
  const part = selected ? getPart(page, selected) : null;
  const box = selected && selected !== 'name' ? page.boxes.find((b) => b.id === selected.split('.')[0]) : null;
  const what = !selected ? null : selected === 'name' ? 'Name' : roleOf(selected) === 'title' ? 'Box title' : 'Box text';

  return (
    <aside className="gn-panel" aria-label="Style">
      {part ? (
        <>
          <div className="gn-panel-title">{what}</div>
          <div className="gn-field">
            <span className="gn-label">Font</span>
            <div className="gn-grid2">
              {FONTS.map((f) => (
                <button key={f.id} className="gn-tile" aria-pressed={part.font === f.id}
                  style={{ fontFamily: f.css }} onClick={() => onStyle({ font: f.id })}>Pow!</button>
              ))}
            </div>
          </div>
          <div className="gn-field">
            <span className="gn-label">Size</span>
            <div className="gn-grid4">
              {SIZES.map((s, i) => (
                <button key={s} className="gn-tile gn-tile-short" aria-pressed={part.size === s}
                  style={{ fontSize: 14 + i * 4 }} onClick={() => onStyle({ size: s })}>{SIZE_LABELS[s]}</button>
              ))}
            </div>
          </div>
          <div className="gn-field">
            <span className="gn-label">Color</span>
            <div className="gn-swatches">
              {COLORS.map((c) => (
                <button key={c.id} className="gn-swatch" aria-label={c.label} aria-pressed={part.color === c.id}
                  style={{ background: c.hex }} onClick={() => onStyle({ color: c.id })} />
              ))}
            </div>
          </div>
          {box && (
            <div className="gn-field">
              <span className="gn-label">Box style</span>
              <div className="gn-grid3">
                {BOX_STYLES.map((s) => (
                  <button key={s} className="gn-tile gn-tile-short gn-tile-small" aria-pressed={box.boxStyle === s}
                    onClick={() => onBoxStyle(box.id, s)}>{BOX_LABELS[s]}</button>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="gn-panel-hint">Tap some words on your page to change how they look.</p>
      )}

      <div className="gn-field gn-panel-bottom">
        <span className="gn-label">The drawing</span>
        <button className="gn-btn gn-btn-yellow" onClick={onAddPhoto}>
          <Icon name="camera" /> {page.image ? 'Change Photo' : 'Add Photo'}
        </button>
        {page.image && (
          <button className="gn-btn" onClick={onRemovePhoto}><Icon name="trash" /> Take It Off</button>
        )}
      </div>
    </aside>
  );
}

export default function CardEditor({ book: initialBook, saveState, onChange, onExit }) {
  const { book, current, commit, update, undo, redo, canUndo, canRedo } = useHistory(initialBook, onChange);
  const [pageId, setPageId] = useState(initialBook.pages[0].id);
  const [selected, setSelected] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [helperChange, setHelperChange] = useState(null); // the book as the helper left it
  const stageRef = useRef(null);
  const fileRef = useRef(null);
  const scale = useFitScale(stageRef);

  // Undo can remove the page being shown; fall back to the first one.
  const page = book.pages.find((p) => p.id === pageId) || book.pages[0];
  const onPage = (b) => b.pages.find((p) => p.id === page.id);

  const selectPage = (id) => { setPageId(id); setSelected(null); };

  const addPage = () => {
    const fresh = newCardPage();
    update((b) => { b.pages.push(fresh); });
    selectPage(fresh.id);
  };

  const deletePage = () => {
    if (!window.confirm(`Delete the page "${pageLabel(page)}"?`)) return;
    const index = book.pages.findIndex((p) => p.id === page.id);
    const neighbour = book.pages[index + 1] || book.pages[index - 1];
    update((b) => { b.pages = b.pages.filter((p) => p.id !== page.id); });
    selectPage(neighbour.id);
  };

  const setText = (target, text) =>
    update((b) => { getPart(onPage(b), target).text = text; }, `text:${page.id}:${target}`);

  const setStyle = (patch) => update((b) => { Object.assign(getPart(onPage(b), selected), patch); });

  const setBoxStyle = (boxId, boxStyle) =>
    update((b) => { onPage(b).boxes.find((x) => x.id === boxId).boxStyle = boxStyle; });

  const pickPhoto = () => fileRef.current?.click();

  const photoDone = async ({ blob, origBlob, w, h }) => {
    const image = { id: newId(), origId: newId(), w, h };
    await Promise.all([putImage(image.id, blob), putImage(image.origId, origBlob)]);
    update((b) => { onPage(b).image = image; });
    setImportFile(null);
  };

  // The helper's changes go in as one undo step, so "Put It Back" is an undo.
  const applyHelper = (actions) => {
    const next = structuredClone(current());
    const applied = applyActions(onPage(next), actions);
    if (!applied) return 0;
    next.updatedAt = Date.now();
    commit(next);
    setHelperChange(next);
    return applied;
  };
  const changePending = helperChange !== null && helperChange === book;

  return (
    <div className="gn-app">
      <header className="gn-topbar gn-work-bar">
        <button className="gn-bar-btn" onClick={onExit}><Icon name="books" /> My Books</button>
        <span className="gn-wordmark">Ada's Graphic Novel Creator</span>
        <span className="gn-episode gn-grow">
          <label htmlFor="gn-book-title">Episode {book.number}:</label>
          <input id="gn-book-title" value={book.title} maxLength={60} placeholder="Name your episode"
            onChange={(e) => update((b) => { b.title = e.target.value; }, 'book-title')} />
        </span>
        <span className="gn-saved" role="status">
          {saveState === 'saved' && <><Icon name="check" size={20} stroke={2.8} /> Saved</>}
          {saveState === 'saving' && 'Saving...'}
          {saveState === 'error' && 'Not saved! Tell a grown-up.'}
        </span>
        <button className="gn-bar-btn" onClick={undo} disabled={!canUndo}><Icon name="undo" /> Undo</button>
        <button className="gn-bar-btn" onClick={redo} disabled={!canRedo}><Icon name="redo" /> Redo</button>
        <button className="gn-bar-btn gn-bar-btn-yellow" onClick={() => window.print()}><Icon name="print" /> Print</button>
      </header>

      <div className="gn-work">
        <nav className="gn-strip" aria-label="Pages">
          <span className="gn-label">Pages</span>
          {book.pages.map((p, i) => (
            <button key={p.id} className="gn-thumb" aria-current={p.id === page.id ? 'page' : undefined}
              onClick={() => selectPage(p.id)}>
              <span className="gn-thumb-kind">{i + 1} · Card</span>
              <span className="gn-thumb-name">{pageLabel(p)}</span>
            </button>
          ))}
          <button className="gn-thumb gn-thumb-new" onClick={addPage}>
            <Icon name="plus" size={24} stroke={2.6} /> New Page
          </button>
          {book.pages.length > 1 && (
            <button className="gn-strip-delete" onClick={deletePage}><Icon name="trash" size={18} /> Delete Page</button>
          )}
        </nav>

        <main className="gn-stage" ref={stageRef}>
          <div className="gn-page-holder" style={{ width: PAGE_W * scale, height: PAGE_H * scale }}>
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              <CardPage key={page.id} page={page} selected={selected}
                onSelect={setSelected} onText={setText} onAddPhoto={pickPhoto} />
            </div>
          </div>
        </main>

        <StylePanel page={page} selected={selected} onStyle={setStyle} onBoxStyle={setBoxStyle}
          onAddPhoto={pickPhoto} onRemovePhoto={() => update((b) => { onPage(b).image = null; })} />
      </div>

      <HelperBar
        key={page.id}
        getPage={() => describePage(page)}
        selected={selected}
        changePending={changePending}
        onApply={applyHelper}
        onKeep={() => setHelperChange(null)}
        onPutBack={() => { undo(); setHelperChange(null); }}
      />

      <input ref={fileRef} type="file" accept="image/*" hidden
        onChange={(e) => { setImportFile(e.target.files[0] || null); e.target.value = ''; }} />
      {importFile && <PhotoImport file={importFile} onCancel={() => setImportFile(null)} onDone={photoDone} />}

      {/* What the printer gets: just the page, filling an A4 sheet. */}
      <div className="gn-print"><CardPage page={page} readOnly /></div>
    </div>
  );
}
