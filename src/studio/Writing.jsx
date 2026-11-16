import Icon from './Icon.jsx';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "2026-11-16" -> "16 November 2026"
export const longDate = (date) => {
  const [y, m, d] = String(date).split('-').map(Number);
  return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : '';
};

// The Writing Studio: Ada's diary. Every page starts private; one she puts on
// her blog can be read by anyone on the public blog page, and taken off again.
export default function Writing({ entries, openId, saveLabel, saveOk, onOpen, onCreate, onChange, onDelete, onDrawing }) {
  const entry = entries.find((e) => e.id === openId) || null;
  const set = (patch) => onChange({ ...entry, ...patch });

  const publish = () => {
    if (!window.confirm('Put this page on your blog? Everyone on the internet will be able to read it.')) return;
    onChange({ ...entry, published: true, publishedAt: Date.now() }, true);
  };
  const unpublish = () => {
    if (!window.confirm('Take this page off your blog? It goes back to being just your diary.')) return;
    onChange({ ...entry, published: false }, true);
  };

  return (
    <div className="gn-app">
      <header className="gn-topbar">
        <span className="gn-wordmark gn-grow">Ada's Writing Studio</span>
        <span className="gn-saved" role="status">
          {saveOk && <Icon name="check" size={20} stroke={2.8} />} {saveLabel}
        </span>
        <button className="gn-bar-btn" onClick={onDrawing}><Icon name="pen" /> Drawing Studio</button>
      </header>
      <main className="gn-write">
        <nav className="gn-write-list" aria-label="Diary pages">
          <button className="gn-btn gn-btn-yellow" onClick={onCreate}><Icon name="plus" /> New Page</button>
          {entries.map((e) => (
            <button key={e.id} className="gn-write-item" aria-current={e.id === openId ? 'page' : undefined} onClick={() => onOpen(e.id)}>
              <span className="gn-write-item-title">{e.title.trim() || 'Untitled'}</span>
              <span className="gn-write-item-meta">{longDate(e.date)} · {e.published ? '🌍 Blog' : '🔒 Diary'}</span>
            </button>
          ))}
          {entries.length === 0 && <p className="gn-note">Your diary is empty. Tap New Page to start.</p>}
        </nav>
        <section className="gn-write-page" aria-label="Diary page">
          {entry ? (
            <>
              <div className="gn-write-head">
                <input className="gn-write-title" aria-label="Title" placeholder="Title" maxLength={80}
                  value={entry.title} onChange={(e) => set({ title: e.target.value })} />
                <input className="gn-write-date" type="date" aria-label="Date"
                  value={entry.date} onChange={(e) => { if (e.target.value) set({ date: e.target.value }); }} />
              </div>
              <p className={`gn-write-where${entry.published ? ' is-public' : ''}`}>
                {entry.published ? '🌍 This page is on your blog. Everyone can read it.' : '🔒 This page is your diary. Only you can read it.'}
              </p>
              <textarea className="gn-write-text" aria-label="Your writing" placeholder="Dear diary..."
                value={entry.text} onChange={(e) => set({ text: e.target.value })} />
              <div className="gn-write-actions">
                {entry.published
                  ? <button className="gn-btn" onClick={unpublish}>Take It Off My Blog</button>
                  : <button className="gn-btn gn-btn-yellow" onClick={publish}>🌍 Put It On My Blog</button>}
                <button className="gn-btn" onClick={() => onDelete(entry)}><Icon name="trash" /> Delete</button>
              </div>
            </>
          ) : (
            <p className="gn-hint-big">{entries.length ? 'Pick a page on the left, or start a new one.' : 'Tap New Page to write your first diary page.'}</p>
          )}
        </section>
      </main>
    </div>
  );
}
