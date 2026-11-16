import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { longDate } from '../studio/Writing.jsx';
import { Header, LikeButton, fetchJson } from './common.jsx';
import '../studio/studio.css';
import './read.css';

// Ada's blog: the diary pages she has put on it, newest first. /blog/#<id>
// jumps to that post.
function Blog() {
  const [posts, setPosts] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchJson('/api/public/entries').then(setPosts, () => setFailed(true));
  }, []);

  useEffect(() => {
    if (posts && window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }, [posts]);

  return (
    <>
      <Header title="Ada's Blog" />
      <main className="rd-main rd-blog">
        {failed && <p className="rd-empty">The blog can't be loaded right now. Try again later.</p>}
        {!failed && !posts && <p className="rd-empty">Loading...</p>}
        {posts && !posts.length && <p className="rd-empty">No posts yet. Come back soon!</p>}
        {posts?.map(({ id, likes, data }) => (
          <article key={id} id={id} className="rd-post">
            <h2 className="rd-post-title"><a href={`#${id}`}>{data.title.trim() || 'Untitled'}</a></h2>
            <p className="rd-post-date">{longDate(data.date)}</p>
            <p className="rd-post-text">{data.text}</p>
            <LikeButton id={id} likes={likes} />
          </article>
        ))}
      </main>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Blog />);
