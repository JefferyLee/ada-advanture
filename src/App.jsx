import { useState } from 'react';
import ForestGame from './components/ForestGame';
import OnlineChat from './components/OnlineChat';

function GameHub() {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      minHeight:'60vh', gap:'32px', padding:'40px 20px' }}>
      <h1 style={{ fontSize:'2.4rem', color:'#fbbf24', letterSpacing:'3px',
        textTransform:'uppercase', textShadow:'0 0 30px #fbbf2466' }}>
        🎮 Game Arcade
      </h1>
      <p style={{ color:'#9ca3af', fontSize:'1rem', maxWidth:'400px', textAlign:'center' }}>
        Choose a game to play
      </p>
      <div style={{ display:'flex', gap:'24px', flexWrap:'wrap', justifyContent:'center' }}>
        <GameCard
          title="🌲 Forest Adventure"
          desc="Help Ada dodge trees and collect mushrooms in the enchanted forest!"
          color="#16a34a"
          onClick={() => window.__setGame('forest')}
        />
        <GameCard
          title="⚔ Tower Defense"
          desc="Build towers and defend your kingdom against 20 waves of enemies!"
          color="#6366f1"
          onClick={() => { window.location.href = '/tower-defense/'; }}
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

function App() {
  const [selectedGame, setSelectedGame] = useState(null);
  const [playerName, setPlayerName] = useState('');

  // Expose setter for GameHub buttons
  window.__setGame = setSelectedGame;

  if (!selectedGame) {
    return <GameHub />;
  }

  return (
    <div>
      <div style={{ textAlign:'left', padding:'8px 20px' }}>
        <a href="#" onClick={e => { e.preventDefault(); setSelectedGame(null); }}
          style={{ color:'#9ca3af', textDecoration:'none', fontSize:'.8rem' }}>
          ← Back to Games
        </a>
      </div>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'center', minHeight:'calc(100vh - 220px)', paddingTop:'8px' }}>
        <ForestGame onPlayerNameChange={setPlayerName} />
        <OnlineChat playerName={playerName} />
      </div>
    </div>
  );
}

export default App;
