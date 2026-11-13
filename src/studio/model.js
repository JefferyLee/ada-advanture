// Data model for a book (one episode) and its pages.
//
// Everything here is plain JSON so a page can be saved, undone, and described
// to the helper without conversion. Every piece of text on a page is a "part"
// with its own font, size and color, addressed by a target string:
//   "name"            a character card's name
//   "<boxId>.title"   a card box heading
//   "<boxId>.body"    a card box's text
//   "item:<id>"       a bubble, caption or sound word on a comic page

export const PAGE_W = 900;
export const PAGE_H = 636; // A4 landscape at the same ratio

// A comic page positions things inside its 3px border.
export const INNER_W = PAGE_W - 6;
export const INNER_H = PAGE_H - 6;

export const FONTS = [
  { id: 'hand', css: "'Patrick Hand', cursive" },
  { id: 'bangers', css: "'Bangers', cursive" },
  { id: 'comic', css: "'Comic Neue', cursive" },
  { id: 'round', css: "'Baloo 2', sans-serif" },
];

export const SIZES = ['s', 'm', 'l', 'xl'];

// Pixel sizes depend on what the part is: a name is much bigger than body text.
const SIZE_PX = {
  name: { s: 40, m: 50, l: 60, xl: 72 },
  title: { s: 20, m: 24, l: 28, xl: 34 },
  body: { s: 17, m: 21, l: 26, xl: 32 },
  bubble: { s: 14, m: 17, l: 21, xl: 26 },
  sound: { s: 40, m: 60, l: 84, xl: 110 },
};

export const COLORS = [
  { id: 'black', hex: '#1B1B2F', label: 'Black' },
  { id: 'blue', hex: '#1F57E0', label: 'Blue' },
  { id: 'orange', hex: '#B4530A', label: 'Orange' },
  { id: 'green', hex: '#1E7A40', label: 'Green' },
  { id: 'purple', hex: '#6A3BC4', label: 'Purple' },
  { id: 'red', hex: '#C22B2B', label: 'Red' },
  { id: 'yellow', hex: '#FFD23F', label: 'Yellow' },
];

export const BOX_STYLES = ['none', 'box', 'banner'];

export const BUBBLE_KINDS = ['speech', 'thought', 'caption', 'sound'];

export const PEN_SIZES = [3, 6, 12];

// Panel layouts, as cells on a small grid: [column, row, columns wide, rows tall].
export const LAYOUTS = {
  wide: { label: 'Three small panels, one wide, one small', cols: 6, rows: 2, cells: [[0, 0, 2, 1], [2, 0, 2, 1], [4, 0, 2, 1], [0, 1, 4, 1], [4, 1, 2, 1]] },
  four: { label: 'Four equal panels', cols: 2, rows: 2, cells: [[0, 0, 1, 1], [1, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 1]] },
  topbig: { label: 'One big panel on top, two below', cols: 2, rows: 2, cells: [[0, 0, 2, 1], [0, 1, 1, 1], [1, 1, 1, 1]] },
  strips: { label: 'Three tall panels', cols: 3, rows: 1, cells: [[0, 0, 1, 1], [1, 0, 1, 1], [2, 0, 1, 1]] },
};

const PANEL_MARGIN = 16;
const PANEL_GAP = 12;

// Where each panel of a layout sits on the page, in page pixels.
export function panelRects(layoutId) {
  const { cols, rows, cells } = LAYOUTS[layoutId] || LAYOUTS.wide;
  const cw = (INNER_W - 2 * PANEL_MARGIN - (cols - 1) * PANEL_GAP) / cols;
  const ch = (INNER_H - 2 * PANEL_MARGIN - (rows - 1) * PANEL_GAP) / rows;
  return cells.map(([c, r, w, h]) => ({
    x: PANEL_MARGIN + c * (cw + PANEL_GAP),
    y: PANEL_MARGIN + r * (ch + PANEL_GAP),
    w: w * cw + (w - 1) * PANEL_GAP,
    h: h * ch + (h - 1) * PANEL_GAP,
  }));
}

export const newId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

const part = (text, font, size, color) => ({ text, font, size, color });

const box = (id, title, color) => ({
  id,
  boxStyle: 'box',
  title: part(title, 'bangers', 'l', color),
  body: part('', 'hand', 'm', 'black'),
});

// A drawing is { id, origId, w, h } plus, once colored, { colorId, fills, gap }.
// id is the line art shown (PNG); with neat lines vecId is the same lines as SVG.
// A drawing imported from a photo also keeps every version made then:
//   versions: [{ neat, figure, id, vecId?, box: { x, y, w, h } }]
// (pencil or neat lines, just the character or everything; box is where that
// version was cut from the straightened photo), and look: { neat, figure } says
// which one is shown. Drawings from before that have `alt` instead: the other
// kind of lines, same size.

export const sameLook = (v, look) => v.neat === look.neat && v.figure === look.figure;

export function drawingLook(image) {
  return image.look || { neat: Boolean(image.vecId), figure: false };
}

export function drawingVersions(image) {
  if (image.versions) return image.versions;
  if (!image.alt) return [];
  const box = { x: 0, y: 0, w: image.w, h: image.h };
  return [
    { neat: Boolean(image.vecId), figure: false, id: image.id, vecId: image.vecId, box },
    { neat: Boolean(image.alt.vecId), figure: false, id: image.alt.id, vecId: image.alt.vecId, box },
  ];
}

// The fields that say which version is on show.
export const shownVersion = (v) => ({ id: v.id, ...(v.vecId ? { vecId: v.vecId } : {}), w: v.box.w, h: v.box.h });

export function newCardPage() {
  return {
    id: newId(),
    type: 'card',
    name: part('', 'bangers', 'l', 'black'),
    // Order is left-top, left-bottom, right-top, right-bottom.
    boxes: [
      box('box1', 'POWERS', 'blue'),
      box('box2', 'STATS', 'blue'),
      box('box3', 'WEAKNESS', 'orange'),
      box('box4', 'ABOUT', 'orange'),
    ],
    image: null,
  };
}

const newPanel = () => ({ id: newId(), image: null });

export function newComicPage() {
  return {
    id: newId(),
    type: 'comic',
    layout: 'wide',
    panels: LAYOUTS.wide.cells.map(newPanel),
    strokes: [], // pen lines drawn on the page: { id, color, size, points: [x, y, x, y, ...] }
    items: [], // bubbles, captions and sound words
  };
}

// Switching layout keeps every panel's contents; panels a layout has no room
// for are only hidden, so switching back brings them back.
export function setLayout(page, layoutId) {
  page.layout = layoutId;
  while (page.panels.length < LAYOUTS[layoutId].cells.length) page.panels.push(newPanel());
}

const ITEM_DEFAULTS = {
  speech: { w: 180, font: 'comic', size: 'm', color: 'black' },
  thought: { w: 180, font: 'comic', size: 'm', color: 'black' },
  caption: { w: 210, font: 'comic', size: 'm', color: 'black' },
  sound: { w: 240, font: 'bangers', size: 'm', color: 'orange' },
};

export function newItem(kind, x, y, text = '') {
  const d = ITEM_DEFAULTS[kind] || ITEM_DEFAULTS.speech;
  return {
    id: newId(),
    kind: ITEM_DEFAULTS[kind] ? kind : 'speech',
    x: Math.round(Math.max(0, Math.min(INNER_W - d.w, x - d.w / 2))),
    y: Math.round(Math.max(0, Math.min(INNER_H - 60, y - 30))),
    w: d.w,
    text,
    font: d.font,
    size: d.size,
    color: d.color,
  };
}

export function newBook(number) {
  const now = Date.now();
  return { id: newId(), number, title: '', pages: [newCardPage()], createdAt: now, updatedAt: now };
}

export function getPart(page, target) {
  if (!target) return null;
  if (target.startsWith('item:')) return (page.items || []).find((it) => `item:${it.id}` === target) || null;
  if (page.type !== 'card') return null;
  if (target === 'name') return page.name;
  const [boxId, role] = target.split('.');
  const b = page.boxes.find((x) => x.id === boxId);
  return b && (role === 'title' || role === 'body') ? b[role] : null;
}

// What kind of text a target is, which decides how big each size is.
export function roleOf(page, target) {
  if (target.startsWith('item:')) return getPart(page, target)?.kind === 'sound' ? 'sound' : 'bubble';
  return target === 'name' ? 'name' : target.split('.')[1];
}

export function partStyle(p, role) {
  const font = FONTS.find((f) => f.id === p.font) || FONTS[0];
  const color = COLORS.find((c) => c.id === p.color) || COLORS[0];
  const fontSize = SIZE_PX[role][p.size] || SIZE_PX[role].m;
  const style = { fontFamily: font.css, fontSize, color: color.hex };
  // Yellow letters get a dark edge, as in comics, or they don't show on white paper.
  if (color.id === 'yellow') Object.assign(style, { WebkitTextStroke: `${Math.max(2, Math.round(fontSize / 15))}px ${COLORS[0].hex}`, paintOrder: 'stroke fill' });
  return style;
}

export function pageLabel(page) {
  if (page.type === 'comic') {
    const first = page.items.find((it) => it.text.trim());
    return first ? first.text.trim() : 'Comic page';
  }
  return page.name.text.trim() || 'New character';
}

// What the helper is told about a page: every text part with its target and
// style. Kept small on purpose.
export function describePage(page) {
  const style = ({ text, font, size, color }) => ({ text, font, size, color });
  if (page.type === 'comic') {
    return {
      kind: 'comic_page',
      panels: LAYOUTS[page.layout].cells.length,
      items: page.items.map((it) => ({ target: `item:${it.id}`, kind: it.kind, ...style(it) })),
      boxes: [],
    };
  }
  const items = [{ target: 'name', ...style(page.name) }];
  for (const b of page.boxes) {
    items.push({ target: `${b.id}.title`, ...style(b.title) });
    items.push({ target: `${b.id}.body`, ...style(b.body) });
  }
  return {
    kind: 'character_card',
    has_drawing: Boolean(page.image),
    items,
    boxes: page.boxes.map((b) => ({ id: b.id, box_style: b.boxStyle })),
  };
}

// Apply the helper's actions to a page (mutates the given page, which the
// caller has already cloned). Anything that doesn't name a real target or a
// known value is skipped. Returns how many actions changed something.
export function applyActions(page, actions) {
  let applied = 0;
  for (const a of Array.isArray(actions) ? actions : []) {
    if (!a) continue;
    if (a.type === 'add_bubble') {
      if (page.type !== 'comic' || !BUBBLE_KINDS.includes(a.bubble_kind) || page.items.length >= 40) continue;
      // New bubbles land near the middle, stepped so several don't stack exactly.
      const step = (page.items.length % 6) * 26;
      page.items.push(newItem(a.bubble_kind, INNER_W / 2 - 60 + step, INNER_H / 2 - 60 + step, String(a.text ?? '').slice(0, 300)));
      applied++;
      continue;
    }
    if (typeof a.target !== 'string') continue;
    if (a.type === 'set_box_style') {
      const b = page.type === 'card' ? page.boxes.find((x) => x.id === a.target) : null;
      if (b && BOX_STYLES.includes(a.box_style)) { b.boxStyle = a.box_style; applied++; }
      continue;
    }
    const p = getPart(page, a.target);
    if (!p) continue;
    if (a.type === 'set_text' && typeof a.text === 'string') { p.text = a.text.slice(0, 600); applied++; }
    if (a.type === 'set_style') {
      let changed = false;
      if (FONTS.some((f) => f.id === a.font)) { p.font = a.font; changed = true; }
      if (SIZES.includes(a.size)) { p.size = a.size; changed = true; }
      if (COLORS.some((c) => c.id === a.color)) { p.color = a.color; changed = true; }
      if (changed) applied++;
    }
  }
  return applied;
}

// About how many rows of body text a card column holds at size m, and how many
// letters fit in a row. The page is a fixed size, so a column with more
// writing than that gets smaller letters.
const COLUMN_ROWS = 13;
const ROW_LETTERS = 27;
const rowsOf = (text) => text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / ROW_LETTERS)), 0);

// "Read My Words": the name and text boxes read off a photo of a card go into
// the card's boxes by where they were drawn, left or right, then top to bottom.
export function wordsOnCard(page, { name, boxes }) {
  const left = boxes.filter((b) => b.x < 500).sort((a, b) => a.x - b.x);
  const right = boxes.filter((b) => b.x >= 500).sort((a, b) => a.x - b.x);
  // A side with more than two gives the ones nearest the middle to the other side.
  while (left.length > 2 && right.length < 2) right.unshift(left.pop());
  while (right.length > 2 && left.length < 2) left.push(right.shift());
  const actions = name ? [{ type: 'set_text', target: 'name', text: name }] : [];
  [left, right].forEach((side, s) => {
    const kept = side.sort((a, b) => a.y - b.y).slice(0, 2);
    const small = kept.reduce((n, b) => n + rowsOf(b.text), 0) > COLUMN_ROWS;
    kept.forEach((b, k) => {
      const { id } = page.boxes[s * 2 + k];
      actions.push({ type: 'set_text', target: `${id}.title`, text: b.title }, { type: 'set_text', target: `${id}.body`, text: b.text });
      if (small) actions.push({ type: 'set_style', target: `${id}.body`, size: 's' });
    });
  });
  const leftOut = boxes.length - Math.min(2, left.length) - Math.min(2, right.length);
  let reply = actions.length ? 'I read your words, checked the spelling, and put them on your card.'
    : "I couldn't find any words on your paper.";
  if (leftOut) reply += leftOut === 1 ? " One box didn't fit." : ` ${leftOut} boxes didn't fit.`;
  return { reply, actions };
}

// Bright colors for painting a drawing and for the pen.
export const PAINT_COLORS = [
  { hex: '#1B1B2F', label: 'Black' },
  { hex: '#D93636', label: 'Red' },
  { hex: '#F58A1F', label: 'Orange' },
  { hex: '#FFD23F', label: 'Yellow' },
  { hex: '#2E8B4E', label: 'Green' },
  { hex: '#3CC4C4', label: 'Teal' },
  { hex: '#1F57E0', label: 'Blue' },
  { hex: '#7B4BD6', label: 'Purple' },
  { hex: '#F7A3CB', label: 'Pink' },
  { hex: '#8A5A3C', label: 'Brown' },
  { hex: '#9AA3B5', label: 'Gray' },
  { hex: '#FFFFFF', label: 'White' },
];
