import { useState, useEffect } from 'react';
import ForestGame from './components/ForestGame';
import OnlineChat from './components/OnlineChat';

/* ── Shared styles ──────────────────────────────────────────────────────────── */
const thStyle = { padding:'6px 10px', borderBottom:'1px solid #374151', textAlign:'left', fontSize:'.75rem', color:'#9ca3af', textTransform:'uppercase' };
const tdStyle = { padding:'5px 10px', fontSize:'.82rem', color:'#d1d5db' };

/* ── Name popup: floats over the home page; nothing below works until a name is given ── */
function NamePrompt({ onEnter }) {
  const [name, setName] = useState(() => localStorage.getItem('arcade_player_name') || '');

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
      </div>
    </div>
  );
}

function ScoreTable({ title, scores, showWave }) {
  return (
    <div style={{ background:'#1f2937', border:'1px solid #374151', borderRadius:'12px', padding:'16px', minWidth:'280px', flex:'1' }}>
      <div style={{ fontSize:'.8rem', textTransform:'uppercase', letterSpacing:'1px', color:'#fbbf24', marginBottom:'10px', fontWeight:'bold' }}>{title}</div>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
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
              <td style={tdStyle}>{r.name}</td>
              <td style={{ ...tdStyle, color:'#fbbf24', fontWeight:'bold' }}>{r.score}</td>
              {showWave && <td style={tdStyle}>{r.wave || '-'}</td>}
              <td style={{ ...tdStyle, color:'#6b7280', fontSize:'.75rem' }}>{r.location}</td>
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

/* ── Scratch game: a project on scratch.mit.edu, played in Scratch's own player ── */
const SCRATCH_PROJECT = '1439703364';
const panelText = { color:'#d1d5db', fontSize:'.9rem', lineHeight:'1.55', whiteSpace:'pre-wrap', overflowWrap:'anywhere', margin:0 };
const panelHeading = { fontSize:'.75rem', textTransform:'uppercase', letterSpacing:'1px', color:'#fbbf24', margin:'18px 0 8px' };

// As big as the window allows, with the project's Instructions and Notes and
// Credits beside it (below it when there is no room).
function ScratchGame() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    fetch('/api/scratch').then(r => (r.ok ? r.json() : null)).then(setInfo).catch(() => {});
  }, []);

  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:'20px', justifyContent:'center', alignItems:'flex-start' }}>
      <iframe
        src={`https://scratch.mit.edu/projects/${SCRATCH_PROJECT}/embed`}
        title="Scratch Game"
        allowFullScreen
        // The stage is 4:3 under Scratch's 52px bar of buttons.
        style={{ '--w':'min(calc(100vw - 40px), calc((100vh - 132px) * 4 / 3))', width:'var(--w)', height:'calc(var(--w) * 3 / 4 + 52px)',
          border:'none', borderRadius:'12px', background:'#1f2937' }}
      />
      {info && (
        <aside style={{ flex:'1 1 280px', maxWidth:'420px', maxHeight:'calc(100vh - 80px)', overflowY:'auto',
          background:'#1f2937', border:'1px solid #374151', borderRadius:'12px', padding:'4px 18px 18px' }}>
          <h2 style={{ fontSize:'1.2rem', color:'#e5e7eb', margin:'16px 0 0' }}>{info.title}</h2>
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
        </aside>
      )}
    </div>
  );
}

/* ── Home: the games and the scoreboards (the chat sits at the bottom) ───── */
function Home({ playerName, onSelectGame }) {
  const [scores, setScores] = useState({ forest: [], 'tower-defense': [] });

  useEffect(() => {
    const poll = () => {
      fetch('/api/scores?game=forest').then(r => r.json()).then(d => { if (Array.isArray(d)) setScores(s => ({ ...s, forest: d })); }).catch(() => {});
      fetch('/api/scores?game=tower-defense').then(r => r.json()).then(d => { if (Array.isArray(d)) setScores(s => ({ ...s, 'tower-defense': d })); }).catch(() => {});
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'28px', padding:'40px 20px', paddingBottom:'240px' }}>
      <h1 style={{ fontSize:'2.4rem', color:'#fbbf24', letterSpacing:'3px', textTransform:'uppercase', textShadow:'0 0 30px #fbbf2466' }}>
        Ada's Studio
      </h1>
      <p style={{ color:'#9ca3af', fontSize:'.9rem' }}>
        {playerName ? <>Welcome, <span style={{ color:'#fbbf24', fontWeight:'bold' }}>{playerName}</span>! Choose a game:</> : 'Choose a game:'}
      </p>
      <div style={{ display:'flex', gap:'24px', flexWrap:'wrap', justifyContent:'center' }}>
        <GameCard
          title="🌲 Forest Adventure"
          desc="Help Ada dodge trees and collect mushrooms in the enchanted forest!"
          color="#16a34a"
          onClick={() => onSelectGame('forest')}
        />
        <GameCard
          title="⚔ Tower Defense"
          desc="Build towers and defend your kingdom against 20 waves of enemies!"
          color="#6366f1"
          onClick={() => onSelectGame('tower-defense')}
        />
        <GameCard
          title="🐱 Scratch Game"
          desc="A game made in Scratch. Click the green flag to start!"
          color="#f97316"
          onClick={() => onSelectGame('scratch')}
        />
      </div>
      <div style={{ display:'flex', gap:'24px', flexWrap:'wrap', justifyContent:'center', maxWidth:'900px', width:'100%' }}>
        <ScoreTable title="🌲 Forest Adventure" scores={scores.forest} />
        <ScoreTable title="⚔ Tower Defense" scores={scores['tower-defense']} showWave />
      </div>
    </div>
  );
}

function GameCard({ title, desc, color, onClick }) {
  return (
    <button onClick={onClick} style={{
      background:'#1f2937', border:`2px solid ${color}`, borderRadius:'16px',
      padding:'28px 24px', width:'260px', cursor:'pointer', textAlign:'left',
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
  const [playerName, setPlayerName]   = useState('');
  const [selectedGame, setSelectedGame] = useState(null);

  const handleEnter = (name) => {
    setPlayerName(name);
    localStorage.setItem('arcade_player_name', name);
  };

  const handleSelectGame = (game) => {
    if (game === 'tower-defense') {
      window.location.href = '/tower-defense/';
      return;
    }
    setSelectedGame(game);
  };

  // Home: games, scoreboards and chat. Until a name is given the name popup
  // floats on top and everything under it is inert (no clicks, no typing).
  if (!selectedGame) {
    return (
      <>
        <div {...(playerName ? {} : { inert: '', 'aria-hidden': true })}>
          <Home playerName={playerName} onSelectGame={handleSelectGame} />
          <OnlineChat playerName={playerName} />
        </div>
        {!playerName && <NamePrompt onEnter={handleEnter} />}
      </>
    );
  }

  // Playing a game: Forest with the chat under it. The Scratch game fills the
  // window, so the chat is hidden there; it keeps running so the player still
  // shows as online.
  return (
    <div>
      <div style={{ textAlign:'left', padding:'8px 20px' }}>
        <a href="#" onClick={e => { e.preventDefault(); setSelectedGame(null); }}
          style={{ color:'#9ca3af', textDecoration:'none', fontSize:'.8rem' }}>
          ← Back to Games
        </a>
        <span style={{ color:'#6b7280', fontSize:'.8rem', marginLeft:'16px' }}>
          Playing as <span style={{ color:'#fbbf24' }}>{playerName}</span>
        </span>
      </div>
      {selectedGame === 'scratch' ? (
        <>
          <ScratchGame />
          <div hidden><OnlineChat playerName={playerName} /></div>
        </>
      ) : (
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'center', minHeight:'calc(100vh - 220px)', paddingTop:'8px' }}>
          <ForestGame playerName={playerName} />
          <OnlineChat playerName={playerName} />
        </div>
      )}
    </div>
  );
}

export default App;
