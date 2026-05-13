// src/components/NetDebug.jsx
//
// TEMPORARY debug overlay for diagnosing the iOS standalone-PWA offline-banner
// issue. Shows current online state + recent network events from
// useOnlineStatus. Tap to collapse/expand. Long-press to hide for the session.
//
// Remove (and its import in App.jsx) once the underlying issue is fixed.

import { useState, useEffect } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export default function NetDebug() {
  const { isOnline, log } = useOnlineStatus();
  const [expanded, setExpanded] = useState(true);
  const [hidden, setHidden] = useState(() =>
    sessionStorage.getItem('netdebug:hidden') === '1'
  );

  useEffect(() => {
    if (hidden) sessionStorage.setItem('netdebug:hidden', '1');
  }, [hidden]);

  if (hidden) return null;

  const handleLongPress = (() => {
    let timer;
    return {
      onTouchStart: () => { timer = setTimeout(() => setHidden(true), 800); },
      onTouchEnd:   () => clearTimeout(timer),
      onMouseDown:  () => { timer = setTimeout(() => setHidden(true), 800); },
      onMouseUp:    () => clearTimeout(timer),
    };
  })();

  return (
    <div
      onClick={() => setExpanded((v) => !v)}
      {...handleLongPress}
      style={{
        position: 'fixed',
        bottom: 'calc(var(--nav-height, 80px) + 8px)',
        right: 8,
        zIndex: 99999,
        background: 'rgba(0,0,0,0.85)',
        color: '#fff',
        border: `1px solid ${isOnline ? '#30D158' : '#FF453A'}`,
        borderRadius: 8,
        padding: expanded ? '6px 8px' : '4px 8px',
        fontFamily: 'monospace',
        fontSize: 10,
        lineHeight: 1.35,
        maxWidth: 280,
        pointerEvents: 'auto',
        userSelect: 'none',
      }}
    >
      <div style={{ fontWeight: 700, color: isOnline ? '#30D158' : '#FF453A' }}>
        net: {isOnline ? 'online' : 'OFFLINE'}{expanded ? '' : '  (tap)'}
      </div>
      {expanded && (
        <>
          <div style={{ marginTop: 4, opacity: 0.6, fontSize: 9 }}>
            long-press to hide
          </div>
          <div style={{ marginTop: 4, maxHeight: 180, overflow: 'auto' }}>
            {log.length === 0 && <div style={{ opacity: 0.5 }}>(no events yet)</div>}
            {log.map((line, i) => (
              <div key={i} style={{ whiteSpace: 'nowrap' }}>{line}</div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
