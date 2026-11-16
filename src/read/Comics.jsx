import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import CardPage from '../studio/CardPage.jsx';
import ComicPage from '../studio/ComicPage.jsx';
import { ImageSource } from '../studio/Drawing.jsx';
import { Header, LikeButton, ScaledPage, fetchJson, publicImage } from './common.jsx';
import '../studio/studio.css';
import './read.css';

const Page = ({ page }) => (page.type === 'comic' ? <ComicPage page={page} readOnly /> : <CardPage page={page} readOnly />);
const nameOf = (book) => `Episode ${book.number}${book.title.trim() ? `: ${book.title.trim()}` : ''}`;

// Ada's comics: the episodes she has published, newest first; open one to
// read it page by page. /comics/#<id> opens that episode.
function Comics() {
  const [books, setBooks] = useState(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState(() => window.location.hash.slice(1));

  useEffect(() => {
    fetchJson('/api/public/books').then(setBooks, () => setFailed(true));
    const onHash = () => { setOpenId(window.location.hash.slice(1)); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const open = books?.find((b) => b.id === openId);
  return (
    <ImageSource.Provider value={publicImage}>
      <Header title="Ada's Comics" />
      <main className="rd-main">
        {failed && <p className="rd-empty">The comics can't be loaded right now. Try again later.</p>}
        {!failed && !books && <p className="rd-empty">Loading...</p>}
        {books && open && (
          <article className="rd-book">
            <a className="rd-back" href="#">← All episodes</a>
            <div className="rd-book-head">
              <h2 className="rd-book-title">{nameOf(open.data)}</h2>
              <LikeButton id={open.id} likes={open.likes} />
            </div>
            {open.data.pages.map((page) => <ScaledPage key={page.id}><Page page={page} /></ScaledPage>)}
          </article>
        )}
        {books && !open && (
          books.length ? (
            <div className="rd-shelf">
              {books.map((b) => (
                <a key={b.id} className="rd-cover" href={`#${b.id}`}>
                  <ScaledPage><Page page={b.data.pages[0]} /></ScaledPage>
                  <span className="rd-cover-name">{nameOf(b.data)}</span>
                  <span className="rd-cover-meta">{b.data.pages.length} {b.data.pages.length === 1 ? 'page' : 'pages'} · ♥ {b.likes}</span>
                </a>
              ))}
            </div>
          ) : <p className="rd-empty">No comics yet. Come back soon!</p>
        )}
      </main>
    </ImageSource.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Comics />);
