import { useCallback, useEffect, useRef, useState } from 'react';
import Bookshelf from './Bookshelf.jsx';
import CardEditor from './CardEditor.jsx';
import { newBook } from './model.js';
import { deleteBook, listBooks, putBook } from './store.js';

// Top of the app: loads the books, shows the shelf or the editor, and saves.
export default function Studio() {
  const [books, setBooks] = useState(null); // null while loading
  const [openId, setOpenId] = useState(null);
  const [saveState, setSaveState] = useState('saved'); // saved | saving | error
  const pending = useRef(null); // { book, timer } waiting to be written

  useEffect(() => {
    listBooks().then(setBooks, () => setBooks([]));
  }, []);

  const flush = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    putBook(p.book).then(() => setSaveState('saved'), () => setSaveState('error'));
  }, []);

  // Writes are held back briefly so typing doesn't hit the disk on every key.
  const saveBook = useCallback((book) => {
    setBooks((bs) => bs.map((b) => (b.id === book.id ? book : b)));
    setSaveState('saving');
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = { book, timer: setTimeout(flush, 400) };
  }, [flush]);

  // Don't lose the last edit if the tab is closed or put in the background.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
    };
  }, [flush]);

  const createBook = async () => {
    const number = books.reduce((m, b) => Math.max(m, b.number), 0) + 1;
    const book = newBook(number);
    await putBook(book);
    setBooks((bs) => [book, ...bs]);
    setOpenId(book.id);
  };

  const removeBook = async (book) => {
    const name = book.title.trim() || `Episode ${book.number}`;
    if (!window.confirm(`Delete "${name}" forever? You can't get it back.`)) return;
    await deleteBook(book.id);
    setBooks((bs) => bs.filter((b) => b.id !== book.id));
  };

  if (books === null) return <div className="gn-app gn-loading">Opening your books...</div>;

  const open = books.find((b) => b.id === openId);
  if (open) {
    return (
      <CardEditor
        key={open.id}
        book={open}
        saveState={saveState}
        onChange={saveBook}
        onExit={() => { flush(); setOpenId(null); }}
      />
    );
  }
  return <Bookshelf books={books} onOpen={setOpenId} onCreate={createBook} onDelete={removeBook} />;
}
