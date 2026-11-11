import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

// The helper's display name. A placeholder until Ada picks one; change it here
// and in the HELPER_NAME setting of the server function.
export const HELPER_NAME = 'Creator Helper';

const SpeechRecognition =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

const PROBLEMS = {
  off: "Your helper isn't switched on yet. Ask a grown-up to set it up.",
  locked: 'Your helper needs a grown-up to sign in first.',
  busy: 'Your helper is very busy. Try again in a minute.',
  other: "Something went wrong and your helper couldn't answer. Try again.",
};

async function askHelper(body) {
  let res;
  try {
    res = await fetch('/api/studio/helper', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { problem: 'other' };
  }
  if (res.status === 503 || res.status === 404) return { problem: 'off' };
  if (res.status === 401 || res.status === 403) return { problem: 'locked' };
  if (res.status === 429) return { problem: 'busy' };
  if (!res.ok) return { problem: 'other' };
  try {
    return await res.json();
  } catch {
    return { problem: 'other' };
  }
}

// The bar fixed to the bottom of the editor: type or talk to the helper, see
// its answer, and keep or put back whatever it changed.
export default function HelperBar({ chips, hint, getPage, selected, changePending, onApply, onKeep, onPutBack }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState('idle'); // idle | thinking
  const [exchange, setExchange] = useState(null); // { said, reply }
  const [listening, setListening] = useState(false);
  const [micTip, setMicTip] = useState(false);
  const history = useRef([]); // earlier turns, as plain text
  const recognition = useRef(null);

  useEffect(() => () => recognition.current?.abort(), []);

  const send = async (message) => {
    const said = message.trim();
    if (!said || status === 'thinking') return;
    recognition.current?.stop();
    setText('');
    setStatus('thinking');
    setExchange({ said, reply: null });
    const answer = await askHelper({ message: said, page: getPage(), selected, history: history.current });
    setStatus('idle');
    if (answer.problem) {
      setExchange({ said, reply: PROBLEMS[answer.problem] });
      return;
    }
    const reply = String(answer.reply || '').trim() || 'Done!';
    history.current = [...history.current, { role: 'user', text: said }, { role: 'assistant', text: reply }].slice(-8);
    onApply(answer.actions);
    setExchange({ said, reply });
  };

  const toggleMic = () => {
    if (!SpeechRecognition) { setMicTip((v) => !v); return; }
    if (listening) { recognition.current?.stop(); return; }
    const rec = new SpeechRecognition();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.onresult = (e) => setText(Array.from(e.results).map((r) => r[0].transcript).join(''));
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognition.current = rec;
    setListening(true);
    rec.start();
  };

  return (
    <footer className="gn-helper">
      {exchange ? (
        <div className="gn-helper-talk" aria-live="polite">
          <span className="gn-bubble gn-bubble-you"><b>You:</b> {exchange.said}</span>
          <span className="gn-bubble gn-bubble-helper">
            <b>Helper:</b> {exchange.reply ?? 'Thinking...'}
          </span>
          {changePending && exchange.reply && (
            <>
              <button className="gn-btn gn-btn-blue" onClick={onKeep}><Icon name="check" size={20} stroke={2.8} /> Keep It</button>
              <button className="gn-btn" onClick={onPutBack}>Put It Back</button>
            </>
          )}
          {!changePending && exchange.reply && (
            <button className="gn-btn" onClick={() => setExchange(null)}>OK</button>
          )}
        </div>
      ) : (
        <div className="gn-chips">
          {chips.map((c) => (
            <button key={c.label} className="gn-chip" disabled={status === 'thinking'}
              onClick={() => send(c.message)}>{c.label}</button>
          ))}
        </div>
      )}

      <form className="gn-helper-row" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <label className="gn-helper-name" htmlFor="gn-ask">{HELPER_NAME}</label>
        <button type="button" className={`gn-mic${listening ? ' is-listening' : ''}`} aria-pressed={listening}
          aria-label={listening ? 'Stop listening' : 'Talk instead of typing'} onClick={toggleMic}>
          <Icon name="mic" size={28} />
        </button>
        <input id="gn-ask" className={`gn-ask${listening ? ' is-listening' : ''}`} value={text} maxLength={400}
          autoComplete="off" placeholder={listening ? 'Listening...' : `Type or talk. Try: ${hint}`}
          onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="gn-btn gn-btn-blue gn-btn-big" disabled={!text.trim() || status === 'thinking'}>
          Send <Icon name="arrow" />
        </button>
      </form>
      {micTip && (
        <p className="gn-note">To talk, tap in the box and press the microphone key on your keyboard.</p>
      )}
    </footer>
  );
}
