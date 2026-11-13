import { useCallback, useEffect, useRef, useState } from 'react';
import Bookshelf from './Bookshelf.jsx';
import Editor from './Editor.jsx';
import { newBook, newId } from './model.js';
import { samePhoto, shrinkPhoto } from './photo.js';
import { listBooks, listPhotos, putImage, removeBook, removePhoto, saveBook, savePhoto } from './store.js';
import { createSync } from './sync.js';

const SAVE_LABELS = {
  off: 'Saved', // no server: this device only, nothing more to say
  synced: 'Saved on all devices',
  syncing: 'Sending...',
  waiting: 'Saved on this device',
};

// Top of the app: loads the books and photos, shows the shelf or the editor,
// saves, and keeps this device in step with the others.
export default function Studio() {
  const [books, setBooks] = useState(null); // null while loading
  const [photos, setPhotos] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [saveState, setSaveState] = useState('saved'); // saved | saving | error
  const [syncState, setSyncState] = useState('off');
  const [arrivals, setArrivals] = useState({}); // book id -> how many times another device's version replaced it
  const [notice, setNotice] = useState(null);
  const pending = useRef(null); // { book, timer } waiting to be written
  const sync = useRef(null);
  const openNow = useRef(null);
  openNow.current = openId;

  const load = () => Promise.all([listBooks(), listPhotos()]);

  // Something was just saved on this device and still has to go to the
  // server. Say so straight away, rather than claiming it is everywhere
  // until the upload has actually finished.
  const send = useCallback(() => {
    setSyncState((s) => (s === 'off' ? s : 'syncing'));
    sync.current?.soon();
  }, []);

  const flush = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    saveBook(p.book).then(
      () => { setSaveState('saved'); send(); },
      () => setSaveState('error'),
    );
  }, [send]);

  useEffect(() => {
    load().then(([b, p]) => { setBooks(b); setPhotos(p); }, () => setBooks([]));

    const engine = createSync(async (event) => {
      if (event.type === 'status') { setSyncState(event.status); return; }
      // Another device's changes arrived. Read them first, then update
      // everything in one go: the lists, which book is open, and the signal
      // that reopens the editor on a book that was replaced. Doing it in one
      // step means the editor is never rebuilt a moment after it was opened.
      const [b, p] = await load();
      setBooks(b);
      setPhotos(p);
      const mine = event.copies.find((c) => c.from === openNow.current);
      if (mine) {
        // The open book was changed elsewhere too. Carry on in the copy that holds this device's work.
        setOpenId(mine.to);
        setNotice('This book was changed on another device too, so I kept both. You are working on the copy.');
      } else if (event.copies.length) {
        setNotice('A book was changed on two devices, so I kept both. Look for the one marked (copy).');
      }
      setArrivals((prev) => {
        const next = { ...prev };
        for (const key of event.changed) {
          if (key.startsWith('book:')) next[key.slice(5)] = (next[key.slice(5)] || 0) + 1;
        }
        return next;
      });
    });
    sync.current = engine;
    engine.now();

    // Check in whenever the app comes back into view, the network returns,
    // and every half minute while it is on screen.
    const wake = () => { if (document.visibilityState === 'visible') engine.now(); };
    const timer = setInterval(wake, 30000);
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);
    return () => {
      engine.stop();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('online', wake);
    };
  }, []);

  // Writes are held back briefly so typing doesn't hit the disk on every key.
  const changeBook = useCallback((book) => {
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
    await saveBook(book);
    setBooks((bs) => [book, ...bs]);
    setOpenId(book.id);
    send();
  };

  const deleteBook = async (book) => {
    const name = book.title.trim() || `Episode ${book.number}`;
    if (!window.confirm(`Delete "${name}" forever? You can't get it back.`)) return;
    await removeBook(book.id);
    setBooks((bs) => bs.filter((b) => b.id !== book.id));
    send();
  };

  // Photos for My Photos: kept here and sent to the other devices. A photo
  // that is already there is not added again.
  const addPhotos = async (files) => {
    let failed = 0;
    let again = 0;
    const prints = photos.map((p) => p.print);
    for (const file of files) {
      try {
        const { blob, print } = await shrinkPhoto(file);
        if (prints.some((p) => samePhoto(p, print))) { again++; continue; }
        prints.push(print);
        const photo = { id: newId(), imageId: newId(), createdAt: Date.now(), print };
        await putImage(photo.imageId, blob);
        await savePhoto(photo);
      } catch {
        failed++;
      }
    }
    const notes = [];
    if (again) {
      notes.push(files.length === 1 ? 'You already have that photo in My Photos.'
        : again === 1 ? 'One of those photos is already in My Photos.' : `${again} of those photos are already in My Photos.`);
    }
    if (failed) notes.push(failed === 1 ? "I couldn't open one of those pictures." : `I couldn't open ${failed} of those pictures.`);
    if (notes.length) setNotice(notes.join(' '));
    setPhotos(await listPhotos());
    send();
  };

  // A photo stays in My Photos after it is put on a page; it is only marked,
  // so the shelf can show the new ones first.
  const markPhotoUsed = async (id) => {
    const photo = photos.find((p) => p.id === id);
    if (!photo || photo.usedAt) return;
    const used = { ...photo, usedAt: Date.now() };
    await savePhoto(used);
    setPhotos((ps) => ps.map((p) => (p.id === id ? used : p)));
    send();
  };

  const deletePhoto = async (photo) => {
    const ask = photo.usedAt ? 'Delete this photo? Your drawing on the page stays.' : 'Delete this photo?';
    if (!window.confirm(ask)) return;
    await removePhoto(photo.id);
    setPhotos((ps) => ps.filter((p) => p.id !== photo.id));
    send();
  };

  const saveLabel = saveState === 'saving' ? 'Saving...'
    : saveState === 'error' ? 'Not saved! Tell a grown-up.'
      : SAVE_LABELS[syncState];
  const saveOk = saveState === 'saved' && syncState !== 'syncing';

  if (books === null) return <div className="gn-app gn-loading">Opening your books...</div>;

  const open = books.find((b) => b.id === openId);
  return (
    <>
      {open ? (
        <Editor
          // A fresh editor when the book is swapped for another device's version.
          key={`${open.id}:${arrivals[open.id] || 0}`}
          book={open}
          photos={photos}
          saveLabel={saveLabel}
          saveOk={saveOk}
          onChange={changeBook}
          onPhotoUsed={markPhotoUsed}
          onExit={() => { flush(); setOpenId(null); }}
        />
      ) : (
        <Bookshelf books={books} photos={photos} saveLabel={saveLabel} saveOk={saveOk}
          onOpen={setOpenId} onCreate={createBook} onDelete={deleteBook}
          onAddPhotos={addPhotos} onDeletePhoto={deletePhoto} />
      )}
      {notice && (
        <div className="gn-toast" role="status">
          <span>{notice}</span>
          <button className="gn-btn" onClick={() => setNotice(null)}>OK</button>
        </div>
      )}
    </>
  );
}
