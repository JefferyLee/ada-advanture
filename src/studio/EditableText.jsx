import { useEffect, useLayoutEffect, useRef } from 'react';

// One piece of editable text on a page. The browser owns the text while the
// child is typing; React only writes into it when the value changes from
// somewhere else (undo, the helper), so the cursor never jumps.
export default function EditableText({
  value, style, placeholder, label, singleLine, readOnly, autoFocus, onChange, onFocus,
}) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.textContent !== value) el.textContent = value;
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

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
