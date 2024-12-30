import React from 'react';

const ControlButtons = React.memo(({ onControlChange }) => {
  return (
    <div id="controls">
      <button onTouchStart={() => onControlChange('left', true)}
              onTouchEnd={() => onControlChange('left', false)}
              onMouseDown={() => onControlChange('left', true)}
              onMouseUp={() => onControlChange('left', false)}>←</button>
      <button onTouchStart={() => onControlChange('jump', true)}
              onTouchEnd={() => onControlChange('jump', false)}
              onMouseDown={() => onControlChange('jump', true)}
              onMouseUp={() => onControlChange('jump', false)}>Jump</button>
      <button onTouchStart={() => onControlChange('right', true)}
              onTouchEnd={() => onControlChange('right', false)}
              onMouseDown={() => onControlChange('right', true)}
              onMouseUp={() => onControlChange('right', false)}>→</button>
      <button onTouchStart={() => onControlChange('bomb', true)}
              onTouchEnd={() => onControlChange('bomb', false)}
              onMouseDown={() => onControlChange('bomb', true)}
              onMouseUp={() => onControlChange('bomb', false)}>Bomb</button>
    </div>
  );
});

export default ControlButtons;