import { useState, useEffect } from 'react';
import ForestGame from './components/ForestGame';
import OnlineChat from './components/OnlineChat';

/* ── Shared styles ──────────────────────────────────────────────────────────── */
const thStyle = { padding:'6px 10px', borderBottom:'1px solid #374151', textAlign:'left', fontSize:'.75rem', color:'#9ca3af', textTransform:'uppercase' };
const tdStyle = { padding:'5px 10px', fontSize:'.82rem', color:'#d1d5db' };

/* ── Welcome Page: name input + online users + scoreboard ─────────────────── */
function WelcomePage({ onEnter }) {
  const [name, setName]       = useState('');
  const [players, setPlayers] = useState([]);
  const [scores, setScores]   = useState({ forest: [], 'tower-defense': [] });

  useEffect(() => {
    const poll = () => {
      fetch('/api/presence').then(r => r.json()).then(d => { if (Array.isArray(d)) setPlayers(d); }).catch(() => {});
      fetch('/api/scores?game=forest').then(r => r.json()).then(d => { if (Array.isArray(d)) setScores(s => ({ ...s, forest: d })); }).catch(() => {});
      fetch('/api/scores?game=tower-defense').then(r => r.json()).then(d => { if (Array.isArray(d)) setScores(s => ({ ...s, 'tower-defense': d })); }).catch(() => {});
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 10) { alert('Please enter a name (1–10 characters)'); return; }
    onEnter(trimmed);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', minHeight:'100vh', padding:'40px 20px', gap:'28px' }}>
      <h1 style={{ fontSize:'2.4rem', color:'#fbbf24', letterSpacing:'3px', textTransform:'uppercase', textShadow:'0 0 30px #fbbf2466' }}>
        🎮 Game Arcade
      </h1>

      {/* Name input */}
      <form onSubmit={handleSubmit} style={{ display:'flex', gap:'10px', alignItems:'center' }}>
        <input
          value={name} onChange={e => setName(e.target.value)}
          placeholder="Enter your name" maxLength={10} autoFocus
          style={{ padding:'10px 16px', fontSize:'1rem', borderRadius:'8px', border:'2px solid #374151',
            background:'#1f2937', color:'#e5e7eb', outline:'none', width:'200px', textAlign:'center' }}
          onFocus={e => e.target.style.borderColor = '#fbbf24'}
          onBlur={e => e.target.style.borderColor = '#374151'}
        />
        <button type="submit" style={{ padding:'10px 28px', fontSize:'1rem', fontWeight:'bold',
          background:'#fbbf24', color:'#111827', border:'none', borderRadius:'8px', cursor:'pointer' }}>
          Enter
        </button>
      </form>

      {/* Online users + Scoreboards */}
      <div style={{ display:'flex', gap:'24px', flexWrap:'wrap', justifyContent:'center', maxWidth:'900px', width:'100%' }}>

        {/* Online Players */}
        <div style={{ background:'#1f2937', border:'1px solid #374151', borderRadius:'12px', padding:'16px', minWidth:'180px', flex:'0 0 180px' }}>
          <div style={{ fontSize:'.75rem', textTransform:'uppercase', letterSpacing:'1px', color:'#4ade80', marginBottom:'10px', fontWeight:'bold' }}>
            🟢 Online ({players.length})
          </div>
          {players.length === 0 && <div style={{ color:'#6b7280', fontSize:'.8rem' }}>No one yet</div>}
          {players.map((p, i) => (
            <div key={i} style={{ marginBottom:'6px' }}>
              <div style={{ fontWeight:'bold', fontSize:'.85rem', color:'#fbbf24' }}>{p.name}</div>
              <div style={{ fontSize:'.7rem', color:'#6b7280' }}>{p.location}</div>
            </div>
          ))}
        </div>

        {/* Forest Scoreboard */}
        <ScoreTable title="🌲 Forest Adventure" scores={scores.forest} />

        {/* Tower Defense Scoreboard */}
        <ScoreTable title="⚔ Tower Defense" scores={scores['tower-defense']} showWave />
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

/* ── Game Hub: choose a game ──────────────────────────────────────────────── */
function GameHub({ playerName, onSelectGame }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      minHeight:'50vh', gap:'28px', padding:'40px 20px' }}>
      <h1 style={{ fontSize:'2rem', color:'#fbbf24', letterSpacing:'3px', textTransform:'uppercase', textShadow:'0 0 30px #fbbf2466' }}>
        🎮 Game Arcade
      </h1>
      <p style={{ color:'#9ca3af', fontSize:'.9rem' }}>
        Welcome, <span style={{ color:'#fbbf24', fontWeight:'bold' }}>{playerName}</span>! Choose a game:
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

  // Not logged in — show welcome page
  if (!playerName) {
    return <WelcomePage onEnter={handleEnter} />;
  }

  // Logged in but no game selected — show game hub
  if (!selectedGame) {
    return <GameHub playerName={playerName} onSelectGame={handleSelectGame} />;
  }

  // Playing Forest game
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
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'center', minHeight:'calc(100vh - 220px)', paddingTop:'8px' }}>
        <ForestGame playerName={playerName} />
        <OnlineChat playerName={playerName} />
      </div>
    </div>
  );
}

export default App;
