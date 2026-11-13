// The Creator Helper's look: a pencil with a purple eraser. A placeholder
// until Ada draws her own. The fills are fixed; the outline follows the text
// color (currentColor) so it still shows in dark mode.
export default function HelperBuddy({ size = 120 }) {
  return (
    <svg className="gn-buddy" width={size} height={size} viewBox="0 0 200 200" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round">
        <path d="M66 112 q-26 -6 -32 -36" fill="none" />
        <path d="M134 112 q26 6 30 30" fill="none" />
        <path d="M66 56 h68 v86 l-34 50 l-34 -50 z" fill="#ffd23f" />
        <path d="M83 167 l17 25 l17 -25 z" fill="#f2c9a0" />
        <path d="M93 182 l7 10 l7 -10 z" fill="#1b1b2f" />
        <rect x="66" y="10" width="68" height="36" rx="12" fill="#6a3bc4" />
        <rect x="62" y="40" width="76" height="16" fill="#c9c9d6" />
      </g>
      <circle cx="86" cy="96" r="8" fill="#1b1b2f" />
      <circle cx="114" cy="96" r="8" fill="#1b1b2f" />
      <circle cx="88.5" cy="93" r="2.8" fill="#fff" />
      <circle cx="116.5" cy="93" r="2.8" fill="#fff" />
      <path d="M88 118 q12 12 24 0" fill="none" stroke="#1b1b2f" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}
