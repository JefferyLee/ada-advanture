// The app has two looks. The choice is remembered on this device; light or
// dark is not a choice here, it follows the system setting.
const KEY = 'gn-look';

export const LOOKS = [
  { id: 'simple', label: 'Simple' },
  { id: 'crafty', label: 'Crafty' },
];

export function getLook() {
  try {
    const saved = localStorage.getItem(KEY);
    if (LOOKS.some((l) => l.id === saved)) return saved;
  } catch {
    // Storage can be blocked (private windows); fall through to the default.
  }
  return 'simple';
}

export function setLook(id) {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Not remembered, but the look still changes for this visit.
  }
}
