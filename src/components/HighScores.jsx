import React from 'react'

function HighScores({ scores, onClose }) {
  return (
    <div className="high-scores">
      <h2>High Scores</h2>
      <ol>
        {scores.map((score, index) => (
          <li key={index}>{score}</li>
        ))}
      </ol>
      <button onClick={onClose}>Close</button>
    </div>
  );
}

export default HighScores;