import { useState } from 'react';
import ForestGame from './components/ForestGame';
import OnlineChat from './components/OnlineChat';

function App() {
  const [playerName, setPlayerName] = useState('');

  return (
    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'center', minHeight:'calc(100vh - 220px)', paddingTop:'8px' }}>
      <ForestGame onPlayerNameChange={setPlayerName} />
      <OnlineChat playerName={playerName} />
    </div>
  );
}

export default App;
