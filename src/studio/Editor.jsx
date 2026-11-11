import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import CardPage from './CardPage.jsx';
import ColorStudio from './ColorStudio.jsx';
import ComicPage from './ComicPage.jsx';
import HelperBar from './HelperBar.jsx';
import Icon from './Icon.jsx';
import PhotoImport from './PhotoImport.jsx';
import PhotoPicker from './PhotoPicker.jsx';
import {
  BOX_STYLES, COLORS, FONTS, INNER_H, INNER_W, LAYOUTS, PAGE_H, PAGE_W, PAINT_COLORS, PEN_SIZES, SIZES,
  applyActions, describePage, getPart, newCardPage, newComicPage, newId, newItem, pageLabel, panelRects,
  roleOf, setLayout,
} from './model.js';
import { imageBlob, putImage } from './store.js';

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
const ITEM_LABELS = { speech: 'Speech bubble', thought: 'Thought bubble', caption: 'Caption', sound: 'Sound word' };
const ADD_BUTTONS = [['speech', 'Speech'], ['thought', 'Thought'], ['caption', 'Caption'], ['sound', 'Sound Word']];
const ADD_ICONS = { speech: 'speech', thought: 'thought', caption: 'caption', sound: 'bolt' };

const CARD_CHIPS = (boxPicked) => [
  { label: 'Fix my spelling', message: boxPicked ? 'Fix my spelling in this box.' : 'Fix my spelling on this page.' },
  { label: 'Make it sound cooler', message: boxPicked ? 'Make this box sound cooler.' : 'Make this page sound cooler.' },
  { label: 'Give me 3 ideas', message: boxPicked ? 'Give me 3 ideas for this box.' : 'Give me 3 ideas for this character.' },
  { label: 'Tidy up this box', message: boxPicked ? 'Tidy up this box.' : 'Tidy up this page.' },
];
const COMIC_CHIPS = [
  { label: 'What could happen next?', message: 'What could happen next in my story? Give me a few ideas.' },
  { label: 'Give me a sound word', message: 'Give me a few sound words that fit this page.' },
  { label: 'Fix my spelling', message: 'Fix my spelling on this page.' },
];

// Font, size and color for one piece of text.
function TextStyle({ part, onStyle }) {
  return (
    <>
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
    </>
  );
}

function PhotoButtons({ image, onAdd, onColor, onRemove }) {
  return (
    <>
      <button className="gn-btn gn-btn-yellow" onClick={onAdd}>
        <Icon name="camera" /> {image ? 'Change Photo' : 'Add Photo'}
      </button>
      {image && <button className="gn-btn" onClick={onColor}><Icon name="bucket" /> Color It</button>}
      {image && <button className="gn-btn" onClick={onRemove}><Icon name="trash" /> Take It Off</button>}
    </>
  );
}

function CardSide({ page, selected, onStyle, onBoxStyle, photo }) {
  const part = getPart(page, selected);
  const box = part && selected !== 'name' ? page.boxes.find((b) => b.id === selected.split('.')[0]) : null;
  const what = !part ? null : selected === 'name' ? 'Name' : roleOf(page, selected) === 'title' ? 'Box title' : 'Box text';

  return (
    <aside className="gn-panel" aria-label="Style">
      {part ? (
        <>
          <div className="gn-panel-title">{what}</div>
          <TextStyle part={part} onStyle={onStyle} />
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
        <PhotoButtons image={page.image} {...photo('card')} />
      </div>
    </aside>
  );
}

function ComicSide({ page, selected, tool, pen, onTool, onPen, onAddItem, onStyle, onDeleteItem, onLayout, photo }) {
  const item = selected?.startsWith('item:') ? getPart(page, selected) : null;
  const panel = selected?.startsWith('panel:') ? page.panels.find((p) => `panel:${p.id}` === selected) : null;

  return (
    <aside className="gn-panel" aria-label="Tools">
      <div className="gn-panel-title">Tools</div>
      <div className="gn-grid3">
        {[['move', 'hand', 'Move'], ['pen', 'pen', 'Pen'], ['eraser', 'eraser', 'Eraser']].map(([id, icon, label]) => (
          <button key={id} className="gn-tile gn-tool" aria-pressed={tool === id} onClick={() => onTool(id)}>
            <Icon name={icon} size={24} /> {label}
          </button>
        ))}
      </div>

      {tool === 'pen' && (
        <>
          <div className="gn-field">
            <span className="gn-label">Pen size</span>
            <div className="gn-grid3">
              {PEN_SIZES.map((s, i) => (
                <button key={s} className="gn-tile gn-tile-short" aria-pressed={pen.size === s}
                  aria-label={['Thin pen', 'Medium pen', 'Thick pen'][i]} onClick={() => onPen({ size: s })}>
                  <span className="gn-dot" style={{ width: s + 4, height: s + 4 }} />
                </button>
              ))}
            </div>
          </div>
          <div className="gn-field">
            <span className="gn-label">Pen color</span>
            <div className="gn-swatches">
              {PAINT_COLORS.map((c) => (
                <button key={c.hex} className="gn-swatch gn-swatch-small" aria-label={c.label}
                  aria-pressed={pen.color === c.hex} style={{ background: c.hex }} onClick={() => onPen({ color: c.hex })} />
              ))}
            </div>
          </div>
        </>
      )}

      {tool === 'eraser' && <p className="gn-panel-hint">Rub over a pen line to erase it.</p>}

      {tool === 'move' && (
        <div className="gn-field">
          <span className="gn-label">Add</span>
          <div className="gn-grid2">
            {ADD_BUTTONS.map(([kind, label]) => (
              <button key={kind} className="gn-tile gn-tool" onClick={() => onAddItem(kind)}>
                <Icon name={ADD_ICONS[kind]} size={24} /> {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {tool === 'move' && item && (
        <>
          <div className="gn-panel-title">{ITEM_LABELS[item.kind]}</div>
          <TextStyle part={item} onStyle={onStyle} />
          <button className="gn-btn" onClick={() => onDeleteItem(item.id)}><Icon name="trash" /> Delete It</button>
        </>
      )}

      {tool === 'move' && panel && (
        <div className="gn-field">
          <span className="gn-label">This panel</span>
          <PhotoButtons image={panel.image} {...photo(selected)} />
        </div>
      )}

      <div className="gn-field gn-panel-bottom">
        <span className="gn-label">Panel layout</span>
        <div className="gn-grid4">
          {Object.entries(LAYOUTS).map(([id, l]) => (
            <button key={id} className="gn-tile gn-layout" aria-label={l.label} aria-pressed={page.layout === id}
              style={{ gridTemplateColumns: `repeat(${l.cols}, 1fr)`, gridTemplateRows: `repeat(${l.rows}, 1fr)` }}
              onClick={() => onLayout(id)}>
              {l.cells.map(([c, r, w, h], i) => (
                <span key={i} style={{ gridColumn: `${c + 1} / span ${w}`, gridRow: `${r + 1} / span ${h}` }} />
              ))}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

// Where a drawing lives: on the card itself, or in one panel of a comic page.
const holderOf = (page, target) =>
  (target === 'card' ? page : page.panels.find((p) => `panel:${p.id}` === target));

export default function Editor({ book: initialBook, photos, saveLabel, saveOk, onChange, onPhotoUsed, onExit }) {
  const { book, current, commit, update, undo, redo, canUndo, canRedo } = useHistory(initialBook, onChange);
  const [pageId, setPageId] = useState(initialBook.pages[0].id);
  const [selected, setSelected] = useState(null);
  const [tool, setTool] = useState('move');
  const [pen, setPen] = useState({ size: PEN_SIZES[1], color: PAINT_COLORS[0].hex });
  const [focusItem, setFocusItem] = useState(null);
  const [photoFor, setPhotoFor] = useState(null); // which drawing the picked photo is for
  const [picking, setPicking] = useState(false); // choosing among the New Photos
  const [importFile, setImportFile] = useState(null);
  const [importPhoto, setImportPhoto] = useState(null); // the New Photo being imported, if it is one
  const [coloring, setColoring] = useState(null); // which drawing is open in Color It
  const [helperChange, setHelperChange] = useState(null); // the book as the helper left it
  const stageRef = useRef(null);
  const fileRef = useRef(null);
  const scale = useFitScale(stageRef);

  // Undo can remove the page being shown; fall back to the first one.
  const page = book.pages.find((p) => p.id === pageId) || book.pages[0];
  const onPage = (b) => b.pages.find((p) => p.id === page.id);
  const isComic = page.type === 'comic';
  // Undo can also remove whatever was selected.
  const live = selected && (selected.startsWith('panel:') ? holderOf(page, selected) : getPart(page, selected))
    ? selected : null;

  const selectPage = (id) => { setPageId(id); setSelected(null); setTool('move'); };

  // While drawing or erasing nothing is selected, so no handles get in the way.
  const pickTool = (next) => { setTool(next); if (next !== 'move') setSelected(null); };

  const addPage = (make) => {
    const fresh = make();
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

  const setStyle = (patch) => update((b) => { Object.assign(getPart(onPage(b), live), patch); });

  const setBoxStyle = (boxId, boxStyle) =>
    update((b) => { onPage(b).boxes.find((x) => x.id === boxId).boxStyle = boxStyle; });

  // Drawings: photo in, color, take off.
  // Photos waiting in the New Photos tray are offered first; without any, go
  // straight to this device's camera or files.
  const pickPhoto = (target) => {
    setPhotoFor(target);
    if (photos.length) setPicking(true);
    else fileRef.current?.click();
  };

  const useTrayPhoto = async (photo) => {
    const blob = await imageBlob(photo.imageId);
    setPicking(false);
    if (!blob) { window.alert("I can't get that photo right now. Try again when you are online."); return; }
    setImportPhoto(photo.id);
    setImportFile(blob);
  };

  const closeImport = () => { setImportFile(null); setImportPhoto(null); };

  const photoDone = async ({ blob, origBlob, w, h }) => {
    const image = { id: newId(), origId: newId(), w, h };
    await Promise.all([putImage(image.id, blob), putImage(image.origId, origBlob)]);
    update((b) => { holderOf(onPage(b), photoFor).image = image; });
    // A tray photo has done its job once it is on a page. The photo itself
    // stays stored with the drawing.
    if (importPhoto) onPhotoUsed(importPhoto);
    closeImport();
  };

  const colorDone = async ({ colorBlob, fills, gap }) => {
    let colorId = null;
    if (colorBlob) {
      colorId = newId();
      await putImage(colorId, colorBlob);
    }
    update((b) => { Object.assign(holderOf(onPage(b), coloring).image, { colorId, fills, gap }); });
    setColoring(null);
  };

  const photo = (target) => ({
    onAdd: () => pickPhoto(target),
    onColor: () => setColoring(target),
    onRemove: () => update((b) => { holderOf(onPage(b), target).image = null; }),
  });

  // Comic page: bubbles and pen strokes.
  const addItem = (kind) => {
    const rects = panelRects(page.layout);
    const at = live?.startsWith('panel:') ? rects[page.panels.findIndex((p) => `panel:${p.id}` === live)] : null;
    // Each new one lands a good step away from the last, so they don't pile up.
    const n = page.items.length % 5;
    const item = at
      ? newItem(kind, at.x + at.w / 2, at.y + 50 + n * 34)
      : newItem(kind, INNER_W / 2 - 120 + n * 60, INNER_H / 2 - 150 + n * 70);
    update((b) => { onPage(b).items.push(item); });
    setSelected(`item:${item.id}`);
    setFocusItem(item.id);
  };

  const deleteItem = (id) => {
    update((b) => { const pg = onPage(b); pg.items = pg.items.filter((it) => it.id !== id); });
    setSelected(null);
  };

  const changeItem = (id, patch) =>
    update((b) => { Object.assign(onPage(b).items.find((it) => it.id === id), patch); });

  const addStroke = (stroke) => update((b) => { onPage(b).strokes.push(stroke); });

  const eraseStroke = (id, key) =>
    update((b) => { const pg = onPage(b); pg.strokes = pg.strokes.filter((s) => s.id !== id); }, key);

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

  const coloringImage = coloring ? holderOf(page, coloring)?.image : null;

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
          {saveOk && <Icon name="check" size={20} stroke={2.8} />} {saveLabel}
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
              <span className="gn-thumb-kind">{i + 1} · {p.type === 'comic' ? 'Comic' : 'Card'}</span>
              <span className="gn-thumb-name">{pageLabel(p)}</span>
            </button>
          ))}
          <button className="gn-thumb gn-thumb-new" onClick={() => addPage(newCardPage)}>
            <Icon name="plus" size={22} stroke={2.6} /> New Card
          </button>
          <button className="gn-thumb gn-thumb-new" onClick={() => addPage(newComicPage)}>
            <Icon name="plus" size={22} stroke={2.6} /> New Comic
          </button>
          {book.pages.length > 1 && (
            <button className="gn-strip-delete" onClick={deletePage}><Icon name="trash" size={18} /> Delete Page</button>
          )}
        </nav>

        <main className="gn-stage" ref={stageRef}>
          <div className="gn-page-holder" style={{ width: PAGE_W * scale, height: PAGE_H * scale }}>
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              {isComic ? (
                <ComicPage key={page.id} page={page} selected={live} tool={tool} pen={pen} focusItem={focusItem}
                  onSelect={setSelected} onText={setText} onAddPhoto={pickPhoto}
                  onAddStroke={addStroke} onEraseStroke={eraseStroke}
                  onChangeItem={changeItem} onDeleteItem={deleteItem} />
              ) : (
                <CardPage key={page.id} page={page} selected={live}
                  onSelect={setSelected} onText={setText} onAddPhoto={() => pickPhoto('card')} />
              )}
            </div>
          </div>
        </main>

        {isComic ? (
          <ComicSide page={page} selected={live} tool={tool} pen={pen}
            onTool={pickTool} onPen={(patch) => setPen((p) => ({ ...p, ...patch }))}
            onAddItem={addItem} onStyle={setStyle} onDeleteItem={deleteItem}
            onLayout={(id) => update((b) => { setLayout(onPage(b), id); })} photo={photo} />
        ) : (
          <CardSide page={page} selected={live} onStyle={setStyle} onBoxStyle={setBoxStyle} photo={photo} />
        )}
      </div>

      <HelperBar
        key={page.id}
        chips={isComic ? COMIC_CHIPS : CARD_CHIPS(Boolean(live) && live !== 'name')}
        hint={isComic ? 'add a speech bubble that says Uh-oh' : 'give my hero one more power'}
        getPage={() => describePage(page)}
        selected={live && !live.startsWith('panel:') ? live : null}
        changePending={changePending}
        onApply={applyHelper}
        onKeep={() => setHelperChange(null)}
        onPutBack={() => { undo(); setHelperChange(null); }}
      />

      <input ref={fileRef} type="file" accept="image/*" hidden
        onChange={(e) => { setImportPhoto(null); setImportFile(e.target.files[0] || null); e.target.value = ''; }} />
      {picking && (
        <PhotoPicker photos={photos} onPick={useTrayPhoto} onCancel={() => setPicking(false)}
          onDevice={() => { setPicking(false); fileRef.current?.click(); }} />
      )}
      {importFile && <PhotoImport file={importFile} onCancel={closeImport} onDone={photoDone} />}
      {coloringImage && <ColorStudio image={coloringImage} onCancel={() => setColoring(null)} onDone={colorDone} />}

      {/* What the printer gets: just the page, filling an A4 sheet. */}
      <div className="gn-print">
        {isComic ? <ComicPage page={page} readOnly /> : <CardPage page={page} readOnly />}
      </div>
    </div>
  );
}
