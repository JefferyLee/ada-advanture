import React, { useEffect, useRef, useState, useCallback } from 'react';
import HighScores from './HighScores';
import { updateHighScores } from './Utils';
import bgMusicFile from '../assets/audio/Walking-in-the-forest-in-morning.mp3';
import redMushroomSoundFile from '../assets/audio/red-mushroom.mp3';
import goldenMushroomSoundFile from '../assets/audio/golden-mushroom.mp3';
import adaImage from '../assets/image/girl-1.png';
import '../styles/ForestGame.css';

const ForestGame = () => {
  // Refs
  const canvasRef = useRef(null);
  const gameObjectsRef = useRef({
    ada: { x: 50, y: 300, width: 50, height: 70, color: 'pink', speed: 5, jumpPower: 0, isJumping: false },
    mushrooms: [],
    trees: [],
    totaltrees: 0,
    score: 0,
    bombs: 0,
    goldenMushroomsInARow: 0,
    redMushroomsInARow: 0,
  });
  const bgMusicRef = useRef(new Audio(bgMusicFile));
  const redMushroomSoundRef = useRef(null);
  const goldenMushroomSoundRef = useRef(null);
  const gameLoopRef = useRef(null);
  const adaImageRef = useRef(null);

  // State
  const [gameState, setGameState] = useState({
    playerName: "",
    gameStarted: false,
    gameOver: true,
    totaltrees: 0,
    score: 0,
    bombs: 0,
    highScores: [],
  });
  const [showHighScores, setShowHighScores] = useState(false);
  const [controls, setControls] = useState({
    left: false,
    right: false,
    up: false,
    bomb: false,
  });

  // Game Logic Functions
  const endGame = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      gameOver: true,
      highScores: updateHighScores(prev.score, prev.highScores),
      score: gameObjectsRef.current.score,
      bombs: gameObjectsRef.current.bombs,
      totaltrees: gameObjectsRef.current.totaltrees
    }));
    bgMusicRef.current.pause();
    // TODO: Implement game over sound
  }, []);

  // Helper function to check collision between two rectangles
  const collision = useCallback((rect1, rect2) => {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
  }, []);

  // Create a new mushroom object
  const createMushroom = useCallback((canvas) => ({
    x: canvas.width + Math.random() * canvas.width,
    y: 320,
    width: 30,
    height: 30,
    color: Math.random() < 0.7 ? 'red' : 'gold',
    speed: Math.random() * 2 + 1
  }), []);

  // Create a new tree object
  const createTree = useCallback((canvas) => {
    const height = Math.random() * 200 + 100;
    return {
      width: 30 + Math.random() * 50,
      height,
      x: canvas.width + Math.random() * canvas.width,
      y: 350 - height
    };
  }, []);

  // Initialize game state
  const initGame = useCallback(() => {
    const canvas = canvasRef.current;
    const gameObjects = gameObjectsRef.current;
    
    // Reset game objects
    Object.assign(gameObjects, {
      ada: { x: 50, y: 300, width: 50, height: 70, color: 'pink', speed: 5, jumpPower: 0, isJumping: false },
      mushrooms: [],
      trees: [],
      score: 0,
      totaltrees: 0,
      bombs: 0,
      goldenMushroomsInARow: 0,
      redMushroomsInARow: 0,
    });

    // Generate initial mushrooms and trees
    for (let i = 0; i < 5; i++) {
      gameObjects.mushrooms.push(createMushroom(canvas));
      gameObjects.trees.push(createTree(canvas));
      gameObjects.totaltrees++;
    }

    setGameState(prev => ({...prev, totaltrees: gameObjects.totaltrees}));
  }, [createMushroom, createTree]);

  // Update game state
  const update = useCallback(() => {
    const canvas = canvasRef.current;
    const gameObjects = gameObjectsRef.current;

    // Move Ada based on controls
    if (controls.left && gameObjects.ada.x > 0) gameObjects.ada.x -= gameObjects.ada.speed;
    if (controls.right && gameObjects.ada.x < canvas.width - gameObjects.ada.width) gameObjects.ada.x += gameObjects.ada.speed;
    
    // Jump logic
    if (controls.up && gameObjects.ada.color === 'pink' && !gameObjects.ada.isJumping) {
      gameObjects.ada.isJumping = true;
      gameObjects.ada.jumpPower = 15;
    }

    if (gameObjects.ada.isJumping) {
      gameObjects.ada.y -= gameObjects.ada.jumpPower;
      gameObjects.ada.jumpPower -= 0.8;
      if (gameObjects.ada.y >= 300) {
        gameObjects.ada.y = 300;
        gameObjects.ada.isJumping = false;
      }
    }

    // Use bomb
    if (controls.bomb && gameState.bombs > 0) {
      gameObjects.bombs--;
      setGameState(prev => ({...prev, bombs: gameObjects.bombs}));
      gameObjects.mushrooms = gameObjects.mushrooms.filter(m => m.color !== 'red' || m.x >= canvas.width || m.x + m.width <= 0);
      setControls(prev => ({ ...prev, bomb: false }));
    }

    // Update mushrooms and check collisions
    gameObjects.mushrooms.forEach((mushroom, index) => {
      mushroom.x -= mushroom.speed;
      if (collision(gameObjects.ada, mushroom)) {
        if (mushroom.color === 'red') {
          handleRedMushroomCollision(gameObjects);
        } else {
          handleGoldenMushroomCollision(gameObjects);
        }
        gameObjects.mushrooms[index] = createMushroom(canvas);
      }
      if (mushroom.x + mushroom.width < 0) {
        gameObjects.mushrooms[index] = createMushroom(canvas);
      }
    });

    // Update trees
    gameObjects.trees.forEach((tree, index) => {
      tree.x -= 1;
      if (tree.x + tree.width < 0) {
        gameObjects.trees[index] = createTree(canvas);
        gameObjects.totaltrees++;
      }
    });

    // Check end game condition
    if (gameState.totaltrees >= 30) endGame();

    setGameState(prevState => ({
      ...prevState,
      score: gameObjects.score,
      bombs: gameObjects.bombs,
      totaltrees: gameObjects.totaltrees
    }));
  }, [controls, collision, createMushroom, createTree, gameState.bombs, endGame]);

  // Handle red mushroom collision
  const handleRedMushroomCollision = (gameObjects) => {
    gameObjects.goldenMushroomsInARow = 0;
    gameObjects.redMushroomsInARow++;
    
    if (redMushroomSoundRef.current) {
      redMushroomSoundRef.current.currentTime = 0;
      redMushroomSoundRef.current.play().catch(e => console.error("Error playing red mushroom sound:", e));
    }
  
    if (gameState.score <= 0) {
      setGameState(prev => ({...prev, gameOver: true, score: -1}));
      endGame();
    }

    if (gameObjects.redMushroomsInARow >= 3) gameObjects.ada.color = 'gray';
    gameObjects.score--;
  };

  // Handle golden mushroom collision
  const handleGoldenMushroomCollision = (gameObjects) => {
    gameObjects.redMushroomsInARow = 0;
    gameObjects.goldenMushroomsInARow++;
    
    if (goldenMushroomSoundRef.current) {
      goldenMushroomSoundRef.current.currentTime = 0;
      goldenMushroomSoundRef.current.play().catch(e => console.error("Error playing golden mushroom sound:", e));
    }
    gameObjects.score += 3;
    gameObjects.ada.color = 'pink';

    if (gameObjects.goldenMushroomsInARow >= 2) {
      gameObjects.bombs++;
      gameObjects.score += 5;
    }
  };

  // Drawing Functions
  const drawButton = useCallback((ctx, text, x, y, width, height) => {
    ctx.fillStyle = 'green';
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = 'white';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(text, x + width / 2, y + height / 2 + 8);
  }, []);
  
  const drawGameOverScreen = useCallback((canvas, ctx) => {
    ctx.fillStyle = 'white';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over', canvas.width / 2, canvas.height / 3);

    ctx.font = '24px Arial';
    ctx.fillText(`Your Score: ${gameState.score}`, canvas.width / 2, canvas.height / 2);

    ctx.font = '18px Arial';
    ctx.fillText(`Trees Passed: ${gameState.totaltrees}`, canvas.width / 2, canvas.height / 2 + 30);
    ctx.fillText(`Bombs Used: ${gameState.bombs}`, canvas.width / 2, canvas.height / 2 + 60);

    drawButton(ctx, 'Restart', canvas.width / 2 - 100, canvas.height * 2 / 3, 200, 50);
    drawButton(ctx, 'High Scores', canvas.width / 2 - 100, canvas.height * 2 / 3 + 70, 200, 50);
  }, [gameState.score, gameState.totaltrees, gameState.bombs, drawButton]);
  
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const gameObjects = gameObjectsRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (gameState.gameOver) {
      drawGameOverScreen(canvas, ctx);
    } else {
      // Draw game elements
      drawBackground(ctx, canvas);
      drawTrees(ctx, gameObjects.trees);
      drawMushrooms(ctx, gameObjects.mushrooms);
      drawAda(ctx, gameObjects.ada);
      drawGameInfo(ctx, gameState);
    }
  }, [gameState, drawGameOverScreen]);

  // Helper drawing functions
  const drawBackground = (ctx, canvas) => {
    ctx.fillStyle = '#8fbc8f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#90ee90';
    ctx.fillRect(0, canvas.height * 0.875, canvas.width, canvas.height);
  };

  const drawTrees = (ctx, trees) => {
    ctx.fillStyle = 'darkgreen';
    trees.forEach(tree => {
      ctx.fillRect(tree.x, tree.y, tree.width, tree.height);
    });
  };

  const drawMushrooms = (ctx, mushrooms) => {
    mushrooms.forEach(mushroom => {
      ctx.fillStyle = mushroom.color;
      ctx.fillRect(mushroom.x, mushroom.y, mushroom.width, mushroom.height);
    });
  };

  const drawAda = useCallback((ctx, ada) => {
    if (adaImageRef.current) {
      ctx.drawImage(adaImageRef.current, ada.x, ada.y, ada.width, ada.height);
    } else {
      // Fallback to rectangle if image hasn't loaded
      ctx.fillStyle = ada.color;
      ctx.fillRect(ada.x, ada.y, ada.width, ada.height);
    }
  }, []);

  const drawGameInfo = (ctx, gameState) => {
    ctx.fillStyle = 'black';
    ctx.font = '16px Arial';  // Reduced font size
    ctx.textAlign = 'left';   // Ensure left alignment
  
    // Adjust positioning
    ctx.fillText(`Forest Adventure: ${gameState.playerName}`, 10, 20);
    ctx.fillText(`Score: ${gameState.score}`, 10, 40);
    ctx.fillText(`Bombs: ${gameState.bombs}`, 10, 60);
  
    // Progress bar
    ctx.fillStyle = 'gray';
    ctx.fillRect(0, ctx.canvas.height - 5, ctx.canvas.width * gameState.totaltrees/30, 5);
  };

  const gameLoop = useCallback(() => {
    if (!gameState.gameOver) {
      update();
    }
    draw();
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [gameState.gameOver, update, draw]);

  // Game Control Functions
  const startGame = useCallback(() => {
    if (gameState.playerName) {
      initGame();
      setGameState(prev => ({ ...prev, gameStarted: true, gameOver: false, score: 0, totaltrees: 0, bombs: 0 }));
    } else {
      alert("Please enter your name before starting the game.");
    }
  }, [gameState.playerName, initGame]);

  const handleNameSubmit = useCallback((e) => {
    e.preventDefault();
    const name = gameState.playerName;
    if (name.length > 0 && name.length <= 10) {
      initGame();
      startGame();
    } else {
      alert("Name must be between 1 and 10 characters.");
    }
  }, [gameState.playerName, startGame, initGame]);
  
  const handleCanvasClick = useCallback((event) => {
    if (gameState.gameOver) {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      
      if (x > canvas.width / 2 - 100 && x < canvas.width / 2 + 100 &&
          y > canvas.height * 2 / 3  && y < canvas.height * 2 / 3 + 50 ) {
        startGame();
      }

      if (x > canvas.width / 2 - 100 && x < canvas.width / 2 + 100 &&
          y > canvas.height * 2 / 3 + 70 && y < canvas.height * 2 / 3 + 120) {
        setShowHighScores(true);
      }
    }
  }, [gameState.gameOver, startGame]);

  // Effects
  useEffect(() => {
    if (gameState.gameOver) {
      draw();
      cancelAnimationFrame(gameLoopRef.current);
    }
  }, [gameState.gameOver, draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.addEventListener('click', handleCanvasClick);
    return () => {
      canvas.removeEventListener('click', handleCanvasClick);
    };
  }, [gameState.gameOver, handleCanvasClick]);  
  
  useEffect(() => {
    if (gameState.gameStarted && !gameState.gameOver) {
      bgMusicRef.current.play().catch(e => console.log("Background music failed to play:", e));
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    } else {
      cancelAnimationFrame(gameLoopRef.current);
      bgMusicRef.current.pause();
    }

    return () => {
      cancelAnimationFrame(gameLoopRef.current);
      bgMusicRef.current.pause();
    };
  }, [gameState.gameStarted, gameState.gameOver, gameLoop]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!gameState.gameStarted || gameState.gameOver) return;
      
      switch (e.code) {
        case 'ArrowLeft':
          setControls(prev => ({ ...prev, left: true }));
          break;
        case 'ArrowRight':
          setControls(prev => ({ ...prev, right: true }));
          break;
        case 'ArrowUp':
        case 'Space':
          setControls(prev => ({ ...prev, up: true }));
          break;
        case 'KeyB':
          setControls(prev => ({ ...prev, bomb: true }));
          break;
        default:
          break;
      }
    };

    const handleKeyUp = (e) => {
      if (!gameState.gameStarted || gameState.gameOver) return;
      
      switch (e.code) {
        case 'ArrowLeft':
          setControls(prev => ({ ...prev, left: false }));
          break;
        case 'ArrowRight':
          setControls(prev => ({ ...prev, right: false }));
          break;
        case 'ArrowUp':
        case 'Space':
          setControls(prev => ({ ...prev, up: false }));
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState.gameStarted, gameState.gameOver]);

  // Preload and set up audio
  useEffect(() => {
    bgMusicRef.current.volume = 0.5;
    bgMusicRef.current.loop = true;

    // Create and set up audio elements
    redMushroomSoundRef.current = new Audio(redMushroomSoundFile);
    goldenMushroomSoundRef.current = new Audio(goldenMushroomSoundFile);

    // Preload audio
    redMushroomSoundRef.current.load();
    goldenMushroomSoundRef.current.load();

    // Load Ada image
    const img = new Image();
    img.src = adaImage;
    img.onload = () => {
      adaImageRef.current = img;
    };

    // Cleanup function
    return () => {
      if (redMushroomSoundRef.current) {
        redMushroomSoundRef.current.pause();
        redMushroomSoundRef.current = null;
      }
      if (goldenMushroomSoundRef.current) {
        goldenMushroomSoundRef.current.pause();
        goldenMushroomSoundRef.current = null;
      }
    };
  }, []);

  return (
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
                onChange={(e) => setGameState(prev => ({ ...prev, playerName: e.target.value}))}
              />
            </label>
            <button type="submit" className="submit-name-button">Start Game</button>
          </form>
        </div>
      )}

      {showHighScores && (
        <HighScores 
          scores={gameState.highScores} 
          onClose={() => setShowHighScores(false)} 
        />
      )}
      {gameState.gameOver && (
        <div className="game-over-overlay">
          Game Over
        </div>
      )}
    </div>
  );
};

export default ForestGame;