import React, { useEffect, useState } from 'react';

function HighScores({ onClose }) {
  const [scores, setScores]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/scores')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load scores');
        return res.json();
      })
      .then(data => { if (!cancelled) setScores(data); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="high-scores">
      <h2>Global High Scores</h2>

      {loading && <p>Loading...</p>}
      {error   && <p>Error: {error}</p>}

      {!loading && !error && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Rank</th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Score</th>
              <th style={thStyle}>From</th>
              <th style={thStyle}>Date</th>
            </tr>
          </thead>
          <tbody>
            {scores.map((row, i) => (
              <tr key={i}>
                <td style={tdStyle}>{i + 1}</td>
                <td style={tdStyle}>{row.name}</td>
                <td style={tdStyle}>{row.score}</td>
                <td style={tdStyle}>{row.location}</td>
                <td style={tdStyle}>{row.played_at.slice(0, 10)}</td>
              </tr>
            ))}
            {scores.length === 0 && (
              <tr>
                <td colSpan={5} style={tdStyle}>No scores yet. Be the first!</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <button onClick={onClose}>Close</button>
    </div>
  );
}

const thStyle = { padding: '6px 12px', borderBottom: '1px solid #fff', textAlign: 'left' };
const tdStyle = { padding: '6px 12px' };

export default HighScores;
