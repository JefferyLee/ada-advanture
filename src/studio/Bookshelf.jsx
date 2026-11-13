import { useRef, useState } from 'react';
import { useStoredImage } from './Drawing.jsx';
import Icon from './Icon.jsx';
import HelperBuddy from './HelperBuddy.jsx';
import { HELPER_NAME } from './HelperBar.jsx';
import { LOOKS, getLook, setLook } from './look.js';

const COVER_COLORS = ['purple', 'orange', 'yellow'];

export function PhotoThumb({ imageId }) {
  const url = useStoredImage(imageId);
  return url ? <img src={url} alt="A photo of a drawing" /> : <span className="gn-thumb-wait">...</span>;
}

export default function Bookshelf({
  books, photos, saveLabel, saveOk, onOpen, onCreate, onDelete, onAddPhotos, onDeletePhoto,
}) {
  const [look, setLookState] = useState(getLook);
  const pickLook = (id) => { setLook(id); setLookState(id); };
  const fileRef = useRef(null);

  return (
    <div className="gn-app">
      <header className="gn-topbar">
        <span className="gn-wordmark gn-grow">Ada's Graphic Novel Creator</span>
        <span className="gn-saved" role="status">
          {saveOk && <Icon name="check" size={20} stroke={2.8} />} {saveLabel}
        </span>
        <span className="gn-look" role="group" aria-label="Look">
          Look:
          {LOOKS.map((l) => (
            <button key={l.id} className="gn-bar-btn" aria-pressed={look === l.id} onClick={() => pickLook(l.id)}>
              {l.label}
            </button>
          ))}
        </span>
      </header>
      <main className="gn-shelf">
        <div className="gn-greet">
          <HelperBuddy size={112} />
          <p className="gn-bubble gn-bubble-helper gn-greet-bubble">
            Hi Ada! I'm your {HELPER_NAME}. Open a book, and ask me for help at the bottom of the page.
          </p>
        </div>
        <h1 className="gn-h1">My Books</h1>
        <div className="gn-covers">
          <button className="gn-cover gn-cover-new" onClick={onCreate}>
            <span className="gn-plus-badge"><Icon name="plus" size={36} stroke={2.8} /></span>
            New Episode
          </button>
          {books.map((book) => {
            const pages = book.pages.length;
            return (
              <div key={book.id} className="gn-cover-wrap">
                <button
                  className={`gn-cover gn-cover-${COVER_COLORS[book.number % COVER_COLORS.length]}`}
                  onClick={() => onOpen(book.id)}
                >
                  <span className="gn-cover-tag">EPISODE {book.number}</span>
                  <span className="gn-cover-title">{book.title.trim() || 'Untitled'}</span>
                  <span className="gn-cover-meta">{pages} {pages === 1 ? 'page' : 'pages'}</span>
                </button>
                <button className="gn-cover-delete" onClick={() => onDelete(book)}
                  aria-label={`Delete episode ${book.number}`}>
                  <Icon name="trash" size={18} /> Delete
                </button>
              </div>
            );
          })}
        </div>
        {books.length === 0 && (
          <p className="gn-hint-big">Tap New Episode to start your first book.</p>
        )}

        <section className="gn-tray" aria-label="New photos">
          <div className="gn-tray-head">
            <h2 className="gn-h2">New Photos</h2>
            <button className="gn-btn gn-btn-yellow" onClick={() => fileRef.current?.click()}>
              <Icon name="camera" /> Add Photos
            </button>
          </div>
          {photos.length === 0 ? (
            <p className="gn-hint-big">
              Take photos of your drawings here. They wait in this tray, on all your devices, until you put them on a page.
            </p>
          ) : (
            <div className="gn-tray-grid">
              {photos.map((photo) => (
                <div key={photo.id} className="gn-tray-item">
                  <PhotoThumb imageId={photo.imageId} />
                  <button className="gn-handle gn-tray-delete" aria-label="Delete photo" onClick={() => onDeletePhoto(photo)}>
                    <Icon name="close" size={18} stroke={3} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple hidden
            onChange={(e) => { const files = [...e.target.files]; e.target.value = ''; if (files.length) onAddPhotos(files); }} />
        </section>
      </main>
    </div>
  );
}
