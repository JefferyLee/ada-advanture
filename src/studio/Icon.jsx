// Small stroke icons, drawn on a 24x24 grid in the current text color.
const PATHS = {
  books: <path d="M4 4h5v16H4zM9 4h5v16H9zM15 6l4-1 3 14-4 1z" />,
  undo: <><path d="M7 6L3 10l4 4" /><path d="M3 10h11a5 5 0 0 1 0 10h-3" /></>,
  redo: <><path d="M17 6l4 4-4 4" /><path d="M21 10H10a5 5 0 0 0 0 10h3" /></>,
  print: <path d="M7 8V3h10v5M7 17H4v-7h16v7h-3M7 14h10v7H7z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12l5 5 9-10" />,
  camera: <><path d="M3 8h4l2-3h6l2 3h4v11H3z" /><circle cx="12" cy="13" r="3.5" /></>,
  mic: <><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  rotate: <><path d="M20 12a8 8 0 1 1-3-6.200" /><path d="M20 4v5h-5" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  move: <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />,
  width: <path d="M4 12h16M4 12l4-4M4 12l4 4M20 12l-4-4M20 12l-4 4" />,
  pen: <path d="M4 20l1-5L16 4l4 4L9 19l-5 1z" />,
  eraser: <path d="M4 16l9-11 7 6-7 9H8l-4-4zM10 20h10" />,
  bucket: <path d="M5 11l7-7 7 7-7 7-7-7zM3 21h18" />,
  speech: <path d="M4 5h16v11H11l-5 4v-4H4z" />,
  thought: <><path d="M7 15a4 4 0 0 1 0-8 5 5 0 0 1 9-1 4 4 0 0 1 1 9H7z" /><circle cx="6" cy="20" r="1.2" /></>,
  caption: <path d="M4 6h16v12H4zM8 10h8M8 14h5" />,
  bolt: <path d="M13 2L5 13h6l-1 9 8-12h-6l1-8z" />,
  hand: <path d="M5 3l14 9-6 1.500 3.500 6-2.500 1.500-3.500-6L6 19z" />,
};

export default function Icon({ name, size = 22, stroke = 2.4 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name]}
    </svg>
  );
}
