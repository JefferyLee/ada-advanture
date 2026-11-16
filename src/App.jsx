import { useState, useEffect, useRef, useCallback } from 'react';
import ForestGame from './components/ForestGame';
import OnlineChat from './components/OnlineChat';

/* ── Shared styles ──────────────────────────────────────────────────────────── */
const thStyle = { padding:'5px 6px', borderBottom:'1px solid #374151', textAlign:'left', fontSize:'.68rem', color:'#9ca3af', textTransform:'uppercase' };
const tdStyle = { padding:'4px 6px', fontSize:'.8rem', color:'#d1d5db', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' };

/* ── Name popup: asked only when a name is needed (a game that keeps scores, a chat message) ── */
function NamePrompt({ initial, onEnter, onCancel }) {
  const [name, setName] = useState(initial);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 10) { alert('Please enter a name (1–10 characters)'); return; }
    onEnter(trimmed);
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center',
      padding:'20px', background:'rgba(10,10,25,.72)', backdropFilter:'blur(3px)' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="name-prompt-title"
        style={{ background:'#1f2937', border:'2px solid #fbbf24', borderRadius:'16px', padding:'28px 32px',
          display:'flex', flexDirection:'column', alignItems:'center', gap:'18px', boxShadow:'0 20px 60px #000a' }}>
        <h2 id="name-prompt-title" style={{ fontSize:'1.4rem', color:'#fbbf24', letterSpacing:'1px', margin:0 }}>
          What's your name?
        </h2>
        <p style={{ margin:0, color:'#9ca3af', fontSize:'.85rem' }}>It goes on the leaderboards and in the chat.</p>
        <form onSubmit={handleSubmit} style={{ display:'flex', gap:'10px', alignItems:'center' }}>
          <input
            value={name} onChange={e => setName(e.target.value)}
            placeholder="Enter your name" maxLength={10} autoFocus
            style={{ padding:'10px 16px', fontSize:'1rem', borderRadius:'8px', border:'2px solid #374151',
              background:'#111827', color:'#e5e7eb', outline:'none', width:'200px', textAlign:'center' }}
            onFocus={e => e.target.style.borderColor = '#fbbf24'}
            onBlur={e => e.target.style.borderColor = '#374151'}
          />
          <button type="submit" style={{ padding:'10px 28px', fontSize:'1rem', fontWeight:'bold',
            background:'#fbbf24', color:'#111827', border:'none', borderRadius:'8px', cursor:'pointer' }}>
            Enter
          </button>
        </form>
        <button onClick={onCancel} style={{ background:'none', border:'none', color:'#9ca3af', cursor:'pointer', fontSize:'.85rem', textDecoration:'underline' }}>
          Not now
        </button>
      </div>
    </div>
  );
}

// A game's top 10, under its card, edged in the game's color.
function ScoreTable({ scores, showWave, color }) {
  return (
    <div style={{ background:'#1f2937', border:'1px solid #374151', borderTop:`3px solid ${color}`, borderRadius:'12px', padding:'12px 10px 8px' }}>
      <div style={{ fontSize:'.75rem', textTransform:'uppercase', letterSpacing:'1px', color:'#fbbf24', margin:'0 0 6px 6px', fontWeight:'bold' }}>🏆 Top 10</div>
      {/* Fixed columns, so a long name or place is cut short instead of pushing out of the card. */}
      <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
        <colgroup>
          <col style={{ width:'30px' }} />
          <col />
          <col style={{ width:'50px' }} />
          {showWave && <col style={{ width:'40px' }} />}
          <col style={{ width: showWave ? '58px' : '72px' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={thStyle}>#</th>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Score</th>
            {showWave && <th style={thStyle}>Wave</th>}
            <th style={thStyle}>From</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((r, i) => (
            <tr key={i}>
              <td style={{ ...tdStyle, color: i === 0 ? '#fbbf24' : i === 1 ? '#d1d5db' : i === 2 ? '#b87333' : '#6b7280' }}>{i + 1}</td>
              <td style={tdStyle} title={r.name}>{r.name}</td>
              <td style={{ ...tdStyle, color:'#fbbf24', fontWeight:'bold' }}>{r.score}</td>
              {showWave && <td style={tdStyle}>{r.wave || '-'}</td>}
              <td style={{ ...tdStyle, color:'#6b7280', fontSize:'.72rem' }} title={r.location}>{r.location}</td>
            </tr>
          ))}
          {scores.length === 0 && (
            <tr><td colSpan={showWave ? 5 : 4} style={{ ...tdStyle, color:'#6b7280', textAlign:'center' }}>No scores yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ── Scratch game: a project on scratch.mit.edu, run in TurboWarp's player so the page can read its score ── */
const SCRATCH_PROJECT = '1439703364';
const SCAFFOLDING = 'https://cdn.jsdelivr.net/npm/@turbowarp/packager@3.14.0/dist/scaffolding/scaffolding-min.js';
const panelText = { color:'#d1d5db', fontSize:'.9rem', lineHeight:'1.55', whiteSpace:'pre-wrap', overflowWrap:'anywhere', margin:0 };
const panelHeading = { fontSize:'.75rem', textTransform:'uppercase', letterSpacing:'1px', color:'#fbbf24', margin:'18px 0 8px' };
const barButton = { display:'flex', alignItems:'center', justifyContent:'center', width:'40px', height:'36px', border:'1px solid #374151',
  borderRadius:'8px', background:'#111827', cursor:'pointer', fontSize:'1.2rem' };

// The player script is big (about 2 MB), so it is only loaded when the game is opened.
let scaffoldingLoaded = null;
function loadScaffolding() {
  if (!scaffoldingLoaded) {
    scaffoldingLoaded = new Promise((resolve, reject) => {
      const script = Object.assign(document.createElement('script'), { src: SCAFFOLDING, onload: resolve });
      script.onerror = () => { scaffoldingLoaded = null; reject(new Error('player did not load')); };
      document.head.appendChild(script);
    });
  }
  return scaffoldingLoaded;
}

// As big as the window allows, with the project's Instructions and Notes and
// Credits beside it (below it when there is no room). A round starts with the
// green flag and ends when the project stops, by itself (game over) or with the
// stop sign; then its "score" variable goes on the Scratch Game leaderboard.
function ScratchGame({ playerName }) {
  const [info, setInfo] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | failed
  const [saved, setSaved] = useState(null); // the last score saved
  const stageRef = useRef(null);
  const playerRef = useRef(null);

  useEffect(() => {
    fetch('/api/scratch').then(r => (r.ok ? r.json() : null)).then(setInfo).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    let player = null;
    let inRound = false;
    // Saves the score of the round that just ended, if the project has a "score" and it isn't 0.
    const endRound = () => {
      if (!inRound) return;
      inRound = false;
      const score = Number(player.getVariable('score'));
      if (!Number.isFinite(score) || score === 0) return;
      fetch('/api/scores', {
        method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: playerName, score: Math.round(score), game: 'scratch' }),
      }).then(r => { if (r.ok && alive) setSaved(Math.round(score)); }).catch(() => {});
    };
    (async () => {
      await loadScaffolding();
      if (!alive) return;
      player = new window.Scaffolding.Scaffolding();
      player.width = 480;
      player.height = 360;
      player.resizeMode = 'preserve-ratio';
      player.setup();
      player.appendTo(stageRef.current);
      player.setUsername(playerName);
      const { storage } = player;
      storage.addWebStore(
        [storage.AssetType.ImageVector, storage.AssetType.ImageBitmap, storage.AssetType.Sound],
        (asset) => `https://assets.scratch.mit.edu/internalapi/asset/${asset.assetId}.${asset.dataFormat}/get/`,
      );
      player.vm.runtime.on('PROJECT_START', () => { inRound = true; });
      player.vm.runtime.on('PROJECT_RUN_STOP', endRound);
      const res = await fetch('/api/scratch?project');
      if (!res.ok) throw new Error('project did not load');
      await player.loadProject(await res.arrayBuffer());
      if (!alive) return;
      playerRef.current = player;
      setState('ready');
    })().catch(() => { if (alive) setState('failed'); });
    return () => {
      alive = false;
      if (!player) return;
      endRound(); // leaving in the middle of a round still saves it
      player.vm.stopAll();
      player.vm.stop();
      player.audioEngine?.audioContext?.close();
    };
  }, [playerName]);

  // The player only takes keys while nothing on the page has focus (and then
  // keeps space and the arrows from scrolling), so the buttons let go of it;
  // otherwise space would also press the green flag again.
  const started = useRef(false);
  const greenFlag = () => {
    const player = playerRef.current;
    if (!player) return;
    if (started.current) player.greenFlag();
    else { started.current = true; player.start(); }
    document.activeElement?.blur();
  };
  const stop = () => {
    playerRef.current?.stopAll();
    document.activeElement?.blur();
  };

  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:'20px', justifyContent:'center', alignItems:'flex-start' }}>
      {/* The stage is 4:3 under a 52px bar with the green flag and the stop sign. */}
      <div style={{ '--w':'min(calc(100vw - 40px), calc((100vh - 132px) * 4 / 3))', width:'var(--w)',
        border:'1px solid #374151', borderRadius:'12px', background:'#1f2937', overflow:'hidden' }}>
        <div style={{ height:'52px', display:'flex', alignItems:'center', gap:'8px', padding:'0 10px', boxSizing:'border-box' }}>
          <button aria-label="Green flag" title="Start" onClick={greenFlag} disabled={state !== 'ready'} style={barButton}>
            <span style={{ color:'#4ade80' }}>⚑</span>
          </button>
          <button aria-label="Stop" title="Stop" onClick={stop} disabled={state !== 'ready'} style={barButton}>
            <span style={{ color:'#f87171' }}>⬣</span>
          </button>
          <span style={{ color:'#9ca3af', fontSize:'.85rem', marginLeft:'6px' }}>
            {state === 'loading' && 'Loading the game...'}
            {state === 'failed' && "I can't load the game right now. Try again later."}
            {state === 'ready' && saved !== null && <>Score saved: <span style={{ color:'#fbbf24', fontWeight:'bold' }}>{saved}</span></>}
          </span>
        </div>
        <div ref={stageRef} aria-label="Scratch Game" style={{ width:'100%', height:'calc(var(--w) * 3 / 4)', background:'#fff' }} />
      </div>
      {info && (
        <aside style={{ flex:'1 1 280px', maxWidth:'420px', maxHeight:'calc(100vh - 80px)', overflowY:'auto',
          background:'#1f2937', border:'1px solid #374151', borderRadius:'12px', padding:'4px 18px 18px' }}>
          <h2 style={{ fontSize:'1.2rem', color:'#e5e7eb', margin:'16px 0 0' }}>{info.title}</h2>
          <p style={{ ...panelText, color:'#9ca3af', marginTop:'8px' }}>
            Press the green flag to play. Your score goes on the leaderboard when the game ends or you press stop.
          </p>
          {info.instructions && (
            <>
              <h3 style={panelHeading}>Instructions</h3>
              <p style={panelText}>{info.instructions}</p>
            </>
          )}
          {info.notes && (
            <>
              <h3 style={panelHeading}>Notes and Credits</h3>
              <p style={panelText}>{info.notes}</p>
            </>
          )}
          <a href={`https://scratch.mit.edu/projects/${SCRATCH_PROJECT}/`} target="_blank" rel="noreferrer"
            style={{ display:'inline-block', marginTop:'18px', color:'#93c5fd', fontSize:'.85rem' }}>See it on Scratch ↗</a>
        </aside>
      )}
    </div>
  );
}

/* ── Home: the games with their leaderboards, the drawing studio (the chat sits at the bottom) ── */
const GAMES = [
  { id: 'forest', title: '🌲 Forest Adventure', desc: 'Help Ada dodge trees and collect mushrooms in the enchanted forest!', color: '#16a34a' },
  { id: 'tower-defense', title: '⚔ Tower Defense', desc: 'Build towers and defend your kingdom against 20 waves of enemies!', color: '#6366f1' },
  { id: 'scratch', title: '🐱 Scratch Game', desc: 'A game made in Scratch. Click the green flag to start!', color: '#f97316' },
];

function Home({ onSelectGame }) {
  const [scores, setScores] = useState({ forest: [], 'tower-defense': [], scratch: [] });

  useEffect(() => {
    const poll = () => {
      fetch('/api/scores?game=forest').then(r => r.json()).then(d => { if (Array.isArray(d)) setScores(s => ({ ...s, forest: d })); }).catch(() => {});
      fetch('/api/scores?game=tower-defense').then(r => r.json()).then(d => { if (Array.isArray(d)) setScores(s => ({ ...s, 'tower-defense': d })); }).catch(() => {});
      fetch('/api/scores?game=scratch').then(r => r.json()).then(d => { if (Array.isArray(d)) setScores(s => ({ ...s, scratch: d })); }).catch(() => {});
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'20px', padding:'24px 20px', paddingBottom:'100px' }}>
      <h1 style={{ fontSize:'2.4rem', color:'#fbbf24', letterSpacing:'3px', textTransform:'uppercase', textShadow:'0 0 30px #fbbf2466', margin:0 }}>
        Ada's Studio
      </h1>
      <p style={{ color:'#9ca3af', fontSize:'.9rem', margin:0 }}>
        Welcome! What would you like to do?
      </p>
      <div style={{ display:'flex', flexDirection:'column', gap:'24px', width:'100%', maxWidth:'868px' }}>
        <Section title="Game Studio">
          {GAMES.map((g) => (
            <div key={g.id} style={{ width:'260px', display:'flex', flexDirection:'column', gap:'14px' }}>
              <GameCard title={g.title} desc={g.desc} color={g.color} onClick={() => onSelectGame(g.id)} />
              <ScoreTable scores={scores[g.id]} showWave={g.id === 'tower-defense'} color={g.color} />
            </div>
          ))}
        </Section>
        <div style={{ display:'flex', gap:'24px', flexWrap:'wrap' }}>
          <Section title="Drawing Studio" note="🔒 Drawing needs the PIN. Anyone can read the comics." grow>
            <StudioCard icon="🎨" title="Start Drawing" color="#8b5cf6"
              desc="Draw, color and make your own comics and character cards."
              onClick={() => onSelectGame('studio')} readHref="/comics/" readLabel="👀 Read Ada's Comics" />
          </Section>
          <Section title="Writing Studio" note="🔒 Writing needs the PIN. Anyone can read the blog." grow>
            <StudioCard icon="✏️" title="Start Writing" color="#0ea5e9"
              desc="Write in your diary, and put your best pages on your blog."
              onClick={() => onSelectGame('writing')} readHref="/blog/" readLabel="📖 Read Ada's Blog" />
          </Section>
        </div>
      </div>
      {/* Portrait: Alfred Edward Chalon, about 1840, Science Museum Group (public domain, via Wikimedia Commons). */}
      <a className="lovelace" href="https://en.wikipedia.org/wiki/Ada_Lovelace" target="_blank" rel="noreferrer">
        <img src="/lovelace.jpg" alt="Ada Lovelace, painted by Alfred Edward Chalon around 1840" />
        <span>Named after <b>Ada Lovelace</b>, the first programmer</span>
      </a>
    </div>
  );
}

// A framed group of cards with its name on top (and a short note under them):
// the games, the drawing studio.
function Section({ title, note, grow, children }) {
  return (
    <section style={{ display:'flex', flexDirection:'column', border:'2px solid #374151', borderRadius:'20px', ...(grow ? { flex:'1 1 340px' } : {}),
      padding:'18px 18px 22px', background:'rgba(26, 26, 46, 0.9)' }}>
      <h2 style={{ fontSize:'1rem', color:'#fbbf24', letterSpacing:'2px', textTransform:'uppercase', margin:'0 0 16px', textAlign:'center' }}>
        {title}
      </h2>
      <div style={{ flex:1, display:'flex', gap:'24px', flexWrap:'wrap', justifyContent:'center', alignItems:'stretch' }}>{children}</div>
      {note && <p style={{ margin:'12px 0 0', color:'#9ca3af', fontSize:'.8rem', textAlign:'center' }}>{note}</p>}
    </section>
  );
}

// A studio's card: the way in (needs the PIN) and, under it, the public page
// with what Ada has published there.
function StudioCard({ icon, title, desc, color, onClick, readHref, readLabel }) {
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'10px' }}>
      <button onClick={onClick} style={{
        background:'#1f2937', border:`2px solid ${color}`, borderRadius:'16px', padding:'16px 18px', cursor:'pointer',
        display:'flex', alignItems:'center', gap:'14px', textAlign:'left', transition:'transform .15s, box-shadow .15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.boxShadow=`0 8px 24px ${color}44`; }}
      onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}
      >
        <span style={{ fontSize:'2.6rem', lineHeight:1 }}>{icon}</span>
        <span style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
          <span style={{ fontSize:'1.15rem', fontWeight:'bold', color:'#e5e7eb' }}>{title} 🔒</span>
          <span style={{ fontSize:'.8rem', color:'#9ca3af', lineHeight:'1.4' }}>{desc}</span>
        </span>
      </button>
      <a href={readHref} style={{ display:'block', textAlign:'center', padding:'8px 12px', borderRadius:'999px', background:color,
        color:'#fff', fontWeight:'bold', fontSize:'.9rem', textDecoration:'none' }}>{readLabel} →</a>
    </div>
  );
}

function GameCard({ title, desc, color, onClick }) {
  return (
    <button onClick={onClick} style={{
      background:'#1f2937', border:`2px solid ${color}`, borderRadius:'16px',
      padding:'28px 24px', width:'260px', minHeight:'160px', cursor:'pointer', textAlign:'left',
      transition:'transform .15s, box-shadow .15s',
    }}
    onMouseEnter={e => { e.currentTarget.style.transform='translateY(-4px)'; e.currentTarget.style.boxShadow=`0 8px 24px ${color}44`; }}
    onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}
    >
      <div style={{ fontSize:'1.3rem', fontWeight:'bold', color:'#e5e7eb', marginBottom:'8px' }}>{title}</div>
      <div style={{ fontSize:'.85rem', color:'#9ca3af', lineHeight:'1.5' }}>{desc}</div>
    </button>
  );
}

/* ── Main App ─────────────────────────────────────────────────────────────── */
function App() {
  // The name is remembered on this device (Tower Defense uses the same one).
  const [playerName, setPlayerName]   = useState(() => { try { return localStorage.getItem('arcade_player_name') || ''; } catch { return ''; } });
  const [selectedGame, setSelectedGame] = useState(null);
  const [asking, setAsking] = useState(null); // { then } while the name popup is up

  // Ask for a name, then carry on with what needed it (if the popup isn't closed with "Not now").
  const askName = useCallback((then) => setAsking({ then }), []);

  const handleEnter = (name) => {
    setPlayerName(name);
    try { localStorage.setItem('arcade_player_name', name); } catch { /* still works for this visit */ }
    asking?.then?.();
    setAsking(null);
  };

  const handleSelectGame = (game) => {
    if (game === 'tower-defense') {
      window.location.href = '/tower-defense/';
      return;
    }
    if (game === 'studio') {
      window.location.href = '/studio/';
      return;
    }
    if (game === 'writing') {
      window.location.href = '/studio/#writing';
      return;
    }
    // Forest and the Scratch game put scores on the leaderboard, so they need a name.
    if (!playerName) { askName(() => setSelectedGame(game)); return; }
    setSelectedGame(game);
  };

  const chat = <OnlineChat playerName={playerName} onNeedName={askName} />;
  const prompt = asking && <NamePrompt initial={playerName} onEnter={handleEnter} onCancel={() => setAsking(null)} />;

  // Home: the studios and the leaderboards, with the chat folded into a bubble in the corner.
  if (!selectedGame) {
    return (
      <>
        <Home onSelectGame={handleSelectGame} />
        {chat}
        {prompt}
      </>
    );
  }

  // Playing a game: Forest or the Scratch game, the chat bubble in the corner.
  return (
    <div>
      {/* The same line as on every page: Home, then where you are. */}
      <div style={{ textAlign:'left', padding:'8px 20px', fontSize:'.8rem', color:'#6b7280' }}>
        <a href="/" onClick={e => { e.preventDefault(); setSelectedGame(null); }}
          style={{ color:'#9ca3af', textDecoration:'none' }}>
          🏠 Home
        </a>
        {' › Game Studio › '}{selectedGame === 'scratch' ? 'Scratch Game' : 'Forest Adventure'}
        <span style={{ marginLeft:'16px' }}>
          Playing as <span style={{ color:'#fbbf24' }}>{playerName}</span>
        </span>
      </div>
      {selectedGame === 'scratch' ? (
        <ScratchGame playerName={playerName} />
      ) : (
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:'8px' }}>
          <ForestGame playerName={playerName} />
        </div>
      )}
      {chat}
      {prompt}
    </div>
  );
}

export default App;
