import { useState } from 'react';
import ForestGame from './components/ForestGame';
import OnlineChat from './components/OnlineChat';

function App() {
  const [playerName, setPlayerName] = useState('');

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'20px 0' }}>
      <ForestGame onPlayerNameChange={setPlayerName} />
      <OnlineChat playerName={playerName} />
    </div>
  );
}

export default App;
