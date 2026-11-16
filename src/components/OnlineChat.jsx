import React, { useCallback, useEffect, useRef, useState } from 'react';

const SESSION_ID = Math.random().toString(36).slice(2);

// The chat, folded into a bubble in the corner that shows how many people are
// online and a dot when there are new messages; tap it to open. Reading needs
// no name; the first message asks for one (onNeedName), then goes out.
function OnlineChat({ playerName, onNeedName }) {
  const [location, setLocation]   = useState('Unknown');
  const [players, setPlayers]     = useState([]);
  const [messages, setMessages]   = useState([]);
  const [inputText, setInputText] = useState('');
  const [open, setOpen]           = useState(false);
  const [seen, setSeen]           = useState(null); // how many messages there were when the chat was last looked at
  const messagesEndRef = useRef(null);
  const sendAfterName = useRef(false);

  const displayName = playerName || 'Anonymous';

  // Fetch location once on mount
  useEffect(() => {
    fetch('/api/location')
      .then(r => r.json())
      .then(d => setLocation(d.location))
      .catch(() => {});
  }, []);

  // Heartbeat every 15 seconds, once the player has a name
  useEffect(() => {
    if (!playerName) return undefined;
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
  }, [playerName, displayName, location]);

  // Poll presence and chat every 5 seconds
  useEffect(() => {
    const poll = () => {
      fetch('/api/presence').then(r => r.json()).then(d => { if (Array.isArray(d)) setPlayers(d); }).catch(() => {});
      fetch('/api/chat').then(r => r.json()).then(d => { if (Array.isArray(d)) setMessages(d); }).catch(() => {});
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  // Messages already there on arrival aren't new; while the chat is open, everything is seen.
  useEffect(() => {
    if (seen === null && messages.length) setSeen(messages.length);
    else if (open) setSeen(messages.length);
  }, [messages, open, seen]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const sendMessage = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    if (!playerName) { sendAfterName.current = true; onNeedName(); return; }
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
  }, [inputText, playerName, displayName, location, onNeedName]);

  // The message typed before the name was asked goes out once there is one.
  useEffect(() => {
    if (playerName && sendAfterName.current) { sendAfterName.current = false; sendMessage(); }
  }, [playerName, sendMessage]);

  const unread = seen !== null && messages.length > seen;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} aria-label={`Open the chat. ${players.length} online${unread ? ', new messages' : ''}`}
        style={{ position:'fixed', right:'20px', bottom:'20px', zIndex:100, width:'64px', height:'64px', borderRadius:'50%',
          border:'none', background:'#2563eb', color:'#fff', fontSize:'1.6rem', cursor:'pointer', boxShadow:'0 6px 20px #0008' }}>
        💬
        <span style={{ position:'absolute', right:'-4px', bottom:'-4px', minWidth:'24px', height:'24px', padding:'0 6px', borderRadius:'12px',
          background:'#16a34a', border:'2px solid #1a1a2e', fontSize:'.75rem', fontWeight:'bold', lineHeight:'20px', boxSizing:'border-box' }}>
          {players.length}
        </span>
        {unread && <span style={{ position:'absolute', right:'2px', top:'2px', width:'14px', height:'14px', borderRadius:'50%', background:'#ef4444', border:'2px solid #1a1a2e' }} />}
      </button>
    );
  }

  return (
    <div role="dialog" aria-label="Chat" style={{ position:'fixed', right:'20px', bottom:'20px', zIndex:100, display:'flex', flexDirection:'column',
      width:'min(360px, calc(100vw - 40px))', height:'min(480px, calc(100vh - 40px))', background:'#12122a', border:'1px solid #2a2a4a',
      borderRadius:'14px', boxShadow:'0 10px 40px #000a', overflow:'hidden', color:'white', fontFamily:'Arial, sans-serif', fontSize:'13px' }}>

      <div style={{ display:'flex', alignItems:'center', padding:'10px 12px', borderBottom:'1px solid #2a2a4a' }}>
        <span style={{ fontWeight:'bold', color:'#7eb8f7', flex:1 }}>💬 Chat</span>
        <button onClick={() => { sendAfterName.current = false; setOpen(false); }} aria-label="Close the chat"
          style={{ background:'none', border:'none', color:'#9ca3af', fontSize:'1.1rem', cursor:'pointer' }}>✕</button>
      </div>

      {/* Online players */}
      <div style={{ padding:'8px 12px', borderBottom:'1px solid #2a2a4a', maxHeight:'70px', overflowY:'auto' }}>
        <span style={{ color:'#4ade80', fontWeight:'bold', marginRight:'6px' }}>Online ({players.length})</span>
        {players.map((p, i) => (
          <span key={i} title={p.location} style={{ display:'inline-block', margin:'2px 4px 2px 0', padding:'1px 8px', borderRadius:'10px', background:'#1e1e3a' }}>{p.name}</span>
        ))}
      </div>

      {/* Chat */}
      <div style={{ flex:1, overflowY:'auto', padding:'10px 12px' }}>
        {messages.length === 0 && <div style={{ color:'#6b7280' }}>No messages yet. Say hi!</div>}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom:'4px', wordBreak:'break-word' }}>
            <span style={{ fontWeight:'bold', color:'#7eb8f7' }}>{m.name}</span>
            <span style={{ fontSize:'11px', color:'#555' }}> [{m.location}]</span>
            <span style={{ color:'#ccc' }}>: {m.message}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div style={{ padding:'10px 12px', borderTop:'1px solid #2a2a4a' }}>
        <div style={{ display:'flex', gap:'8px' }}>
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder={playerName ? `Chatting as ${playerName}...` : 'Say something...'}
            maxLength={200}
            aria-label="Message"
            style={{ flex:1, minWidth:0, padding:'6px 10px', background:'#1e1e3a', border:'1px solid #333', borderRadius:'4px', color:'white', fontSize:'13px', outline:'none' }}
          />
          <button
            onClick={sendMessage}
            style={{ padding:'6px 16px', background:'#2a6a2a', color:'white', border:'none', borderRadius:'4px', cursor:'pointer', fontSize:'13px' }}
          >
            Send
          </button>
        </div>
        {playerName && (
          <div style={{ marginTop:'6px', fontSize:'11px', color:'#6b7280' }}>
            Chatting as {playerName}. <button onClick={() => onNeedName()} style={{ background:'none', border:'none', padding:0, color:'#7eb8f7', cursor:'pointer', fontSize:'11px', textDecoration:'underline' }}>Not you?</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default OnlineChat;
