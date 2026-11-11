// Data model for a book (one episode) and its pages.
//
// Everything here is plain JSON so a page can be saved, undone, and described
// to the helper without conversion. Every piece of text on a page is a "part"
// with its own font, size and color, addressed by a target string:
//   "name"            the character's name
//   "<boxId>.title"   a box heading
//   "<boxId>.body"    a box's text

export const PAGE_W = 900;
export const PAGE_H = 636; // A4 landscape at the same ratio

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
};

export const COLORS = [
  { id: 'black', hex: '#1B1B2F', label: 'Black' },
  { id: 'blue', hex: '#1F57E0', label: 'Blue' },
  { id: 'orange', hex: '#B4530A', label: 'Orange' },
  { id: 'green', hex: '#1E7A40', label: 'Green' },
  { id: 'purple', hex: '#6A3BC4', label: 'Purple' },
  { id: 'red', hex: '#C22B2B', label: 'Red' },
];

export const BOX_STYLES = ['none', 'box', 'banner'];

export const newId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

const part = (text, font, size, color) => ({ text, font, size, color });

const box = (id, title, color) => ({
  id,
  boxStyle: 'box',
  title: part(title, 'bangers', 'l', color),
  body: part('', 'hand', 'm', 'black'),
});

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
    image: null, // { id, origId, w, h } once a drawing is added
  };
}

export function newBook(number) {
  const now = Date.now();
  return { id: newId(), number, title: '', pages: [newCardPage()], createdAt: now, updatedAt: now };
}

export const roleOf = (target) => (target === 'name' ? 'name' : target.split('.')[1]);

export function getPart(page, target) {
  if (target === 'name') return page.name;
  const [boxId, role] = target.split('.');
  const b = page.boxes.find((x) => x.id === boxId);
  return b && (role === 'title' || role === 'body') ? b[role] : null;
}

export function partStyle(p, role) {
  const font = FONTS.find((f) => f.id === p.font) || FONTS[0];
  const color = COLORS.find((c) => c.id === p.color) || COLORS[0];
  return { fontFamily: font.css, fontSize: SIZE_PX[role][p.size] || SIZE_PX[role].m, color: color.hex };
}

export const pageLabel = (page) => page.name.text.trim() || 'New character';

// What the helper is told about a page: every text part with its target and
// style, plus each box's frame style. Kept small on purpose.
export function describePage(page) {
  const items = [{ target: 'name', ...page.name }];
  for (const b of page.boxes) {
    items.push({ target: `${b.id}.title`, ...b.title });
    items.push({ target: `${b.id}.body`, ...b.body });
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
    if (!a || typeof a.target !== 'string') continue;
    if (a.type === 'set_box_style') {
      const b = page.boxes.find((x) => x.id === a.target);
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
