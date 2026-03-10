import React, { useCallback, useEffect, useRef, useState } from 'react';

const SESSION_ID = Math.random().toString(36).slice(2);

function OnlineChat({ playerName }) {
  const [location, setLocation]   = useState('Unknown');
  const [players, setPlayers]     = useState([]);
  const [messages, setMessages]   = useState([]);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);

  const displayName = playerName || 'Anonymous';

  // Fetch location once on mount
  useEffect(() => {
    fetch('/api/location')
      .then(r => r.json())
      .then(d => setLocation(d.location))
      .catch(() => {});
  }, []);

  // Heartbeat every 15 seconds
  useEffect(() => {
    const beat = () => {
      fetch('/api/presence', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sessionId: SESSION_ID, name: displayName, location }),
      }).catch(() => {});
    };
    beat();
    const id = setInterval(beat, 15000);
    return () => clearInterval(id);
  }, [displayName, location]);

  // Poll presence and chat every 5 seconds
  useEffect(() => {
    const poll = () => {
      fetch('/api/presence').then(r => r.json()).then(setPlayers).catch(() => {});
      fetch('/api/chat').then(r => r.json()).then(setMessages).catch(() => {});
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    fetch('/api/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: displayName, location, message: text }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setInputText('');
          fetch('/api/chat').then(r => r.json()).then(setMessages).catch(() => {});
        }
      })
      .catch(() => {});
  }, [inputText, displayName, location]);

  return (
    <div style={{ display:'flex', width:'800px', height:'220px', marginTop:'10px', background:'#12122a', borderRadius:'8px', overflow:'hidden', color:'white', fontFamily:'Arial, sans-serif', fontSize:'13px' }}>

      {/* Online players */}
      <div style={{ width:'190px', borderRight:'1px solid #2a2a4a', padding:'10px', overflowY:'auto', flexShrink:0 }}>
        <div style={{ fontWeight:'bold', marginBottom:'8px', color:'#7eb8f7' }}>
          Online ({players.length})
        </div>
        {players.map((p, i) => (
          <div key={i} style={{ marginBottom:'8px' }}>
            <div style={{ fontWeight:'bold' }}>{p.name}</div>
            <div style={{ fontSize:'11px', color:'#888' }}>{p.location}</div>
          </div>
        ))}
      </div>

      {/* Chat */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', padding:'10px' }}>
        <div style={{ fontWeight:'bold', marginBottom:'8px', color:'#7eb8f7' }}>Chat</div>
        <div style={{ flex:1, overflowY:'auto', marginBottom:'8px' }}>
          {messages.map((m, i) => (
            <div key={i} style={{ marginBottom:'4px', wordBreak:'break-word' }}>
              <span style={{ fontWeight:'bold', color:'#7eb8f7' }}>{m.name}</span>
              <span style={{ fontSize:'11px', color:'#555' }}> [{m.location}]</span>
              <span style={{ color:'#ccc' }}>: {m.message}</span>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder={`Chatting as ${displayName}...`}
            maxLength={200}
            style={{ flex:1, padding:'6px 10px', background:'#1e1e3a', border:'1px solid #333', borderRadius:'4px', color:'white', fontSize:'13px', outline:'none' }}
          />
          <button
            onClick={sendMessage}
            style={{ padding:'6px 16px', background:'#2a6a2a', color:'white', border:'none', borderRadius:'4px', cursor:'pointer', fontSize:'13px' }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default OnlineChat;
