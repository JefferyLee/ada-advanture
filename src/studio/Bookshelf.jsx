import { useState } from 'react';
import Icon from './Icon.jsx';
import { LOOKS, getLook, setLook } from './look.js';

const COVER_COLORS = ['purple', 'orange', 'yellow'];

export default function Bookshelf({ books, onOpen, onCreate, onDelete }) {
  const [look, setLookState] = useState(getLook);
  const pickLook = (id) => { setLook(id); setLookState(id); };

  return (
    <div className="gn-app">
      <header className="gn-topbar">
        <span className="gn-wordmark gn-grow">Ada's Graphic Novel Creator</span>
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
      </main>
    </div>
  );
}
