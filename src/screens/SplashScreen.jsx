import { useState, useEffect } from 'react';

const styles = `
  .splash-screen {
    position: fixed;
    inset: 0;
    background: #000000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    z-index: 999;
  }

  .splash-screen.fading-out {
    animation: splashFadeOut 0.4s ease-in-out forwards;
  }

  .splash-emoji {
    font-size: 64px;
    line-height: 1;
    animation: splashFadeScaleIn 0.4s ease-out 0.3s both;
  }

  .splash-title {
    font-size: 42px;
    font-weight: 800;
    letter-spacing: -1px;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
    animation: splashFadeIn 0.4s ease-in-out 0.8s both;
  }

  .splash-title .white { color: #FFFFFF; }
  .splash-title .orange { color: #FF6B1A; }

  .splash-tagline {
    font-size: 16px;
    color: #8E8E93;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
    animation: splashFadeIn 0.4s ease-in-out 1.3s both;
  }

  @keyframes splashFadeScaleIn {
    from { opacity: 0; transform: scale(0.7); }
    to   { opacity: 1; transform: scale(1); }
  }

  @keyframes splashFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  @keyframes splashFadeOut {
    from { opacity: 1; }
    to   { opacity: 0; }
  }
`;

export default function SplashScreen({ onComplete }) {
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFadingOut(true), 2200);
    const doneTimer = setTimeout(() => onComplete(), 2500);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onComplete]);

  return (
    <>
      <style>{styles}</style>
      <div className={`splash-screen${fadingOut ? ' fading-out' : ''}`}>
        <div className="splash-emoji">🏀</div>
        <div className="splash-title">
          <span className="white">Live</span>
          <span className="orange">Hoops</span>
        </div>
        <div className="splash-tagline">Find your run.</div>
      </div>
    </>
  );
}
