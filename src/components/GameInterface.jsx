import React from 'react';
import '../styles/GameComponent.css'; // 假设我们将创建一个对应的CSS文件

const GameInterface = () => {
  return (
    <div id="gameContainer">
      <div id="startScreen">
        Start Game
      </div>

      <div id="scoreboard">
        <h2>High Scores</h2>
        <button>Start Game</button>
      </div>

      <div id="controls">
        <button>←</button>
        <button>Jump</button>
        <button>→</button>
        <button>Bomb</button>
      </div>
    </div>
  );
};

export default GameInterface;