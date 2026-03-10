import React, { useEffect, useRef, useState, useCallback } from 'react';
import HighScores from './HighScores';
import bgMusicFile from '../assets/audio/Walking-in-the-forest-in-morning.mp3';
import redMushroomSoundFile from '../assets/audio/red-mushroom.mp3';
import goldenMushroomSoundFile from '../assets/audio/golden-mushroom.mp3';
import adaImage from '../assets/image/girl-1.png';
import '../styles/ForestGame.css';

// Pure helper functions — no React deps, defined once at module level
const createMushroom = (canvas) => ({
  x: canvas.width + Math.random() * canvas.width,
  y: 320, width: 30, height: 30,
  color: Math.random() < 0.7 ? 'red' : 'gold',
  speed: Math.random() * 2 + 1,
});

const createTree = (canvas) => {
  const height = Math.random() * 200 + 100;
  return { width: 30 + Math.random() * 50, height, x: canvas.width + Math.random() * canvas.width, y: 350 - height };
};

const rectCollision = (r1, r2) =>
  r1.x < r2.x + r2.width && r1.x + r1.width > r2.x &&
  r1.y < r2.y + r2.height && r1.y + r1.height > r2.y;

const drawButton = (ctx, text, x, y, w, h) => {
  ctx.fillStyle = 'green';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'white';
  ctx.font = '20px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(text, x + w / 2, y + h / 2 + 7);
};

const ForestGame = ({ onPlayerNameChange }) => {
  // ── Refs (read inside game loop, no re-renders needed) ──────────────────
  const canvasRef      = useRef(null);
  const gameObjectsRef = useRef({
    ada: { x: 50, y: 300, width: 50, height: 70, color: 'pink', speed: 5, jumpPower: 0, isJumping: false },
    mushrooms: [], trees: [], totaltrees: 0, score: 0, bombs: 0,
    goldenMushroomsInARow: 0, redMushroomsInARow: 0,
  });
  // Key fix: controls as ref → no re-renders on keypress
  const controlsRef    = useRef({ left: false, right: false, up: false, bomb: false });
  const gameActiveRef  = useRef(false);   // true while game is running
  const gameStartedRef = useRef(false);   // true after name submitted
  const playerNameRef  = useRef('');
  const bgMusicRef     = useRef(new Audio(bgMusicFile));
  const redSoundRef    = useRef(null);
  const goldSoundRef   = useRef(null);
  const gameLoopRef    = useRef(null);
  const adaImageRef    = useRef(null);
  const endGameRef     = useRef(null);    // stable handle to endGame for external callers
  const frameCountRef  = useRef(0);

  // ── React state (UI only) ───────────────────────────────────────────────
  const [gameState, setGameState] = useState({
    playerName: '', gameStarted: false, gameOver: true,
    totaltrees: 0, score: 0, bombs: 0,
  });
  const [showHighScores,    setShowHighScores]    = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [adminPassword,     setAdminPassword]     = useState('');

  // ── Audio + image setup ─────────────────────────────────────────────────
  useEffect(() => {
    bgMusicRef.current.volume = 0.5;
    bgMusicRef.current.loop = true;
    redSoundRef.current  = new Audio(redMushroomSoundFile);
    goldSoundRef.current = new Audio(goldenMushroomSoundFile);
    redSoundRef.current.load();
    goldSoundRef.current.load();
    const img = new Image();
    img.src = adaImage;
    img.onload = () => { adaImageRef.current = img; };
    return () => {
      redSoundRef.current?.pause();
      goldSoundRef.current?.pause();
    };
  }, []);

  // ── Main game loop — runs ONCE on mount, reads everything from refs ──────
  useEffect(() => {
    const endGame = () => {
      if (!gameActiveRef.current) return;
      gameActiveRef.current = false;
      bgMusicRef.current.pause();
      const go = gameObjectsRef.current;
      setGameState(prev => ({ ...prev, gameOver: true, score: go.score, bombs: go.bombs, totaltrees: go.totaltrees }));
      fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: playerNameRef.current, score: go.score }),
      }).catch(() => {});
    };
    endGameRef.current = endGame;

    const handleRedMushroom = (go) => {
      go.goldenMushroomsInARow = 0;
      go.redMushroomsInARow++;
      if (redSoundRef.current) { redSoundRef.current.currentTime = 0; redSoundRef.current.play().catch(() => {}); }
      go.score--;
      if (go.score < 0) { endGame(); return; }
      if (go.redMushroomsInARow >= 3) go.ada.color = 'gray';
    };

    const handleGoldenMushroom = (go) => {
      go.redMushroomsInARow = 0;
      go.goldenMushroomsInARow++;
      if (goldSoundRef.current) { goldSoundRef.current.currentTime = 0; goldSoundRef.current.play().catch(() => {}); }
      go.score += 3;
      go.ada.color = 'pink';
      if (go.goldenMushroomsInARow >= 2) { go.bombs++; go.score += 5; }
    };

    const loop = () => {
      const canvas = canvasRef.current;
      if (!canvas) { gameLoopRef.current = requestAnimationFrame(loop); return; }
      const ctx = canvas.getContext('2d');
      const go  = gameObjectsRef.current;
      const c   = controlsRef.current;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!gameActiveRef.current) {
        // ── Game-over screen ──
        ctx.fillStyle = 'white';
        ctx.font = 'bold 48px Arial'; ctx.textAlign = 'center';
        ctx.fillText('Game Over', canvas.width / 2, canvas.height / 3);
        ctx.font = '24px Arial';
        ctx.fillText(`Your Score: ${go.score}`, canvas.width / 2, canvas.height / 2);
        ctx.font = '18px Arial';
        ctx.fillText(`Trees Passed: ${go.totaltrees}`, canvas.width / 2, canvas.height / 2 + 30);
        ctx.fillText(`Bombs Used: ${go.bombs}`,        canvas.width / 2, canvas.height / 2 + 60);
        const lx = canvas.width / 2 - 190, rx = canvas.width / 2 + 10;
        const row1 = canvas.height * 0.65, row2 = row1 + 50;
        drawButton(ctx, 'Restart',           lx, row1, 180, 40);
        drawButton(ctx, 'High Scores',       rx, row1, 180, 40);
        drawButton(ctx, 'Change Player',     lx, row2, 180, 40);
        drawButton(ctx, 'Clear Leaderboard', rx, row2, 180, 40);
      } else {
        // ── Update ──
        if (c.left  && go.ada.x > 0)                              go.ada.x -= go.ada.speed;
        if (c.right && go.ada.x < canvas.width - go.ada.width)   go.ada.x += go.ada.speed;
        if (c.up && go.ada.color === 'pink' && !go.ada.isJumping) { go.ada.isJumping = true; go.ada.jumpPower = 15; }
        if (go.ada.isJumping) {
          go.ada.y -= go.ada.jumpPower;
          go.ada.jumpPower -= 0.8;
          if (go.ada.y >= 300) { go.ada.y = 300; go.ada.isJumping = false; }
        }
        if (c.bomb && go.bombs > 0) {
          go.bombs--;
          go.mushrooms = go.mushrooms.filter(m => m.color !== 'red' || m.x >= canvas.width || m.x + m.width <= 0);
          c.bomb = false;
        }
        go.mushrooms.forEach((m, i) => {
          m.x -= m.speed;
          if (rectCollision(go.ada, m)) {
            if (m.color === 'red') handleRedMushroom(go); else handleGoldenMushroom(go);
            go.mushrooms[i] = createMushroom(canvas);
          } else if (m.x + m.width < 0) {
            go.mushrooms[i] = createMushroom(canvas);
          }
        });
        go.trees.forEach((t, i) => {
          t.x -= 1;
          if (t.x + t.width < 0) { go.trees[i] = createTree(canvas); go.totaltrees++; }
        });
        if (go.totaltrees >= 30) { endGame(); gameLoopRef.current = requestAnimationFrame(loop); return; }

        // ── Draw ──
        ctx.fillStyle = '#8fbc8f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#90ee90'; ctx.fillRect(0, canvas.height * 0.875, canvas.width, canvas.height);
        ctx.fillStyle = 'darkgreen';
        go.trees.forEach(t => ctx.fillRect(t.x, t.y, t.width, t.height));
        go.mushrooms.forEach(m => { ctx.fillStyle = m.color; ctx.fillRect(m.x, m.y, m.width, m.height); });
        if (adaImageRef.current) {
          ctx.drawImage(adaImageRef.current, go.ada.x, go.ada.y, go.ada.width, go.ada.height);
        } else {
          ctx.fillStyle = go.ada.color; ctx.fillRect(go.ada.x, go.ada.y, go.ada.width, go.ada.height);
        }
        ctx.fillStyle = 'black'; ctx.font = '16px Arial'; ctx.textAlign = 'left';
        ctx.fillText(`Forest Adventure: ${playerNameRef.current}`, 10, 20);
        ctx.fillText(`Score: ${go.score}`, 10, 40);
        ctx.fillText(`Bombs: ${go.bombs}`, 10, 60);
        ctx.fillStyle = 'gray';
        ctx.fillRect(0, canvas.height - 5, canvas.width * go.totaltrees / 30, 5);

        // Sync React state every 10 frames (not every frame)
        frameCountRef.current++;
        if (frameCountRef.current % 10 === 0) {
          setGameState(prev => ({ ...prev, score: go.score, bombs: go.bombs, totaltrees: go.totaltrees }));
        }
      }

      gameLoopRef.current = requestAnimationFrame(loop);
    };

    gameLoopRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(gameLoopRef.current);
  }, []); // ← empty deps: game loop is stable forever

  // ── Keyboard controls — stable, directly mutate controlsRef ────────────
  useEffect(() => {
    const down = (e) => {
      if (!gameStartedRef.current || !gameActiveRef.current) return;
      const c = controlsRef.current;
      if (e.code === 'ArrowLeft')               c.left = true;
      else if (e.code === 'ArrowRight')         c.right = true;
      else if (e.code === 'ArrowUp' || e.code === 'Space') c.up = true;
      else if (e.code === 'KeyB')               c.bomb = true;
    };
    const up = (e) => {
      const c = controlsRef.current;
      if (e.code === 'ArrowLeft')               c.left = false;
      else if (e.code === 'ArrowRight')         c.right = false;
      else if (e.code === 'ArrowUp' || e.code === 'Space') c.up = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup',   up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // ── Game control callbacks ──────────────────────────────────────────────
  const initGame = useCallback(() => {
    const canvas = canvasRef.current;
    const go = gameObjectsRef.current;
    Object.assign(go, {
      ada: { x: 50, y: 300, width: 50, height: 70, color: 'pink', speed: 5, jumpPower: 0, isJumping: false },
      mushrooms: [], trees: [], score: 0, totaltrees: 0, bombs: 0,
      goldenMushroomsInARow: 0, redMushroomsInARow: 0,
    });
    for (let i = 0; i < 5; i++) {
      go.mushrooms.push(createMushroom(canvas));
      go.trees.push(createTree(canvas));
      go.totaltrees++;
    }
  }, []);

  const startGame = useCallback(() => {
    const name = playerNameRef.current;
    if (!name) { alert('Please enter your name before starting the game.'); return; }
    initGame();
    controlsRef.current = { left: false, right: false, up: false, bomb: false };
    frameCountRef.current = 0;
    gameActiveRef.current  = true;
    gameStartedRef.current = true;
    bgMusicRef.current.play().catch(() => {});
    setGameState(prev => ({ ...prev, gameStarted: true, gameOver: false, score: 0, totaltrees: 0, bombs: 0 }));
    onPlayerNameChange?.(name);
  }, [initGame, onPlayerNameChange]);

  const handleNameSubmit = useCallback((e) => {
    e.preventDefault();
    const name = gameState.playerName;
    if (name.length > 0 && name.length <= 10) {
      playerNameRef.current = name;
      startGame();
    } else {
      alert('Name must be between 1 and 10 characters.');
    }
  }, [gameState.playerName, startGame]);

  const handleClearLeaderboard = useCallback(() => {
    fetch('/api/scores', {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminPassword}` },
    })
      .then(r => r.json())
      .then(d => alert(d.ok ? 'Leaderboard cleared.' : 'Wrong password.'))
      .catch(() => alert('Failed to connect.'))
      .finally(() => { setShowPasswordPrompt(false); setAdminPassword(''); });
  }, [adminPassword]);

  const handleCanvasClick = useCallback((event) => {
    if (gameActiveRef.current) return; // only react when game is over
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const lx = canvas.width / 2 - 190, rx = canvas.width / 2 + 10;
    const row1 = canvas.height * 0.65, row2 = row1 + 50;
    const inLeft  = x > lx && x < lx + 180;
    const inRight = x > rx && x < rx + 180;
    const inRow1  = y > row1 && y < row1 + 40;
    const inRow2  = y > row2 && y < row2 + 40;
    if (inLeft  && inRow1) startGame();
    if (inRight && inRow1) setShowHighScores(true);
    if (inLeft  && inRow2) {
      gameStartedRef.current = false;
      playerNameRef.current  = '';
      setGameState(prev => ({ ...prev, gameStarted: false, playerName: '' }));
      onPlayerNameChange?.('');
    }
    if (inRight && inRow2) setShowPasswordPrompt(true);
  }, [startGame, onPlayerNameChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.addEventListener('click', handleCanvasClick);
    return () => canvas.removeEventListener('click', handleCanvasClick);
  }, [handleCanvasClick]);

  // Touch control helpers — directly mutate ref, zero re-renders
  const press   = (key) => () => { controlsRef.current[key] = true; };
  const release = (key) => () => { controlsRef.current[key] = false; };

  const isPlaying = gameState.gameStarted && !gameState.gameOver;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div className="game-container">
        <canvas
          ref={canvasRef}
          width={800}
          height={400}
          className="game-canvas"
          style={{ display: gameState.gameStarted ? 'block' : 'none' }}
        />

        {!gameState.gameStarted && (
          <div className="start-screen">
            <form onSubmit={handleNameSubmit}>
              <label>Enter your name to play:
                <input
                  type="text"
                  className="player-name-input"
                  value={gameState.playerName}
                  onChange={(e) => setGameState(prev => ({ ...prev, playerName: e.target.value }))}
                  maxLength={10}
                />
              </label>
              <button type="submit" className="submit-name-button">Start Game</button>
            </form>
          </div>
        )}

        {showHighScores && <HighScores onClose={() => setShowHighScores(false)} />}

        {showPasswordPrompt && (
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:20 }}>
            <div style={{ background:'#222', color:'white', padding:'24px', borderRadius:'10px', textAlign:'center', minWidth:'260px' }}>
              <p style={{ marginBottom:'12px' }}>Enter admin password:</p>
              <input
                type="password"
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleClearLeaderboard()}
                autoFocus
                style={{ fontSize:'16px', padding:'8px', width:'100%', boxSizing:'border-box', marginBottom:'16px' }}
              />
              <div style={{ display:'flex', gap:'10px', justifyContent:'center' }}>
                <button onClick={handleClearLeaderboard} style={{ padding:'8px 20px', background:'green', color:'white', border:'none', borderRadius:'5px', cursor:'pointer' }}>Confirm</button>
                <button onClick={() => { setShowPasswordPrompt(false); setAdminPassword(''); }} style={{ padding:'8px 20px', background:'#555', color:'white', border:'none', borderRadius:'5px', cursor:'pointer' }}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Touch controls — visible during gameplay, optimized for iPad */}
      {isPlaying && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          width: '800px', padding: '10px 20px', boxSizing: 'border-box',
          background: 'rgba(0,0,0,0.3)', borderRadius: '0 0 8px 8px', gap: '10px',
        }}>
          {/* Left / Right */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onPointerDown={press('left')} onPointerUp={release('left')} onPointerLeave={release('left')}
              style={btnStyle}
            >◀</button>
            <button
              onPointerDown={press('right')} onPointerUp={release('right')} onPointerLeave={release('right')}
              style={btnStyle}
            >▶</button>
          </div>

          {/* Jump + Bomb */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onPointerDown={press('bomb')} onPointerUp={release('bomb')} onPointerLeave={release('bomb')}
              style={{ ...btnStyle, background: 'rgba(200,80,0,0.7)', minWidth: '70px' }}
            >💣 Bomb</button>
            <button
              onPointerDown={press('up')} onPointerUp={release('up')} onPointerLeave={release('up')}
              style={{ ...btnStyle, background: 'rgba(0,120,200,0.7)', minWidth: '70px' }}
            >▲ Jump</button>
          </div>
        </div>
      )}
    </div>
  );
};

const btnStyle = {
  fontSize: '22px', padding: '14px 20px', minWidth: '60px',
  background: 'rgba(255,255,255,0.18)', color: 'white',
  border: '2px solid rgba(255,255,255,0.4)', borderRadius: '8px',
  cursor: 'pointer', touchAction: 'none', userSelect: 'none',
  WebkitUserSelect: 'none',
};

export default ForestGame;
