import { useEffect, useRef, useState } from 'react';

const styles = `
  .splash-screen {
    position: fixed;
    inset: 0;
    isolation: isolate;
    overflow: hidden;
    pointer-events: none;
    background:
      radial-gradient(circle at 50% 44%, rgba(255, 107, 0, 0.16), transparent 32%),
      radial-gradient(circle at 50% 78%, rgba(255, 128, 64, 0.12), transparent 36%),
      linear-gradient(180deg, #050505 0%, #090909 48%, #020202 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 22px;
    z-index: 999;
    color: #ffffff;
  }

  .splash-screen.fading-out {
    animation: splashFadeOut 0.55s cubic-bezier(0.6, 0, 0.2, 1) forwards;
  }

  .splash-screen::before {
    content: '';
    position: absolute;
    inset: -24%;
    z-index: -2;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.055) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.055) 1px, transparent 1px);
    background-size: 34px 34px;
    -webkit-mask-image: radial-gradient(circle at 50% 46%, #000 0%, transparent 62%);
    mask-image: radial-gradient(circle at 50% 46%, #000 0%, transparent 62%);
    opacity: 0.42;
    transform: perspective(620px) rotateX(64deg) translateY(4%);
    animation: splashGridDrift 3.2s ease-out both;
  }

  .splash-screen::after {
    content: '';
    position: absolute;
    inset: 12% 15%;
    z-index: -1;
    background:
      radial-gradient(circle, rgba(255, 122, 0, 0.24), transparent 45%),
      radial-gradient(circle, rgba(255, 255, 255, 0.08), transparent 28%);
    filter: blur(34px);
    opacity: 0;
    animation: splashGlowIn 1.4s ease-out 0.35s forwards;
  }

  .splash-logo-stage {
    position: relative;
    width: min(168px, 42vw);
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    filter: drop-shadow(0 0 36px rgba(255, 107, 0, 0.3));
  }

  .splash-logo-stage::before,
  .splash-logo-stage::after {
    content: '';
    position: absolute;
    border-radius: 999px;
    border: 1px solid rgba(255, 122, 0, 0.3);
    opacity: 0;
    transform: scale(0.72);
    animation: splashOrbitIn 0.85s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  .splash-logo-stage::before {
    width: 116%;
    height: 42%;
    bottom: 7%;
    box-shadow: 0 0 24px rgba(255, 107, 0, 0.22);
    animation-delay: 0.65s;
  }

  .splash-logo-stage::after {
    width: 86%;
    height: 31%;
    bottom: 16%;
    border-color: rgba(255, 166, 56, 0.36);
    animation-delay: 0.8s;
  }

  .splash-logo-fill,
  .splash-line-logo {
    position: absolute;
    width: 100%;
    height: 100%;
  }

  .splash-logo-fill {
    inset: 0;
    border-radius: 32px;
    opacity: 0;
    transform: scale(0.92);
    filter: saturate(1.08) contrast(1.08);
    animation: splashLogoFill 0.58s ease-out 1.18s forwards;
  }

  .splash-line-logo {
    inset: 0;
    overflow: visible;
  }

  .splash-line-logo path {
    fill: none;
    stroke: #ff8a1f;
    stroke-width: 4.2;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    filter: drop-shadow(0 0 8px rgba(255, 107, 0, 0.85));
    animation: splashStrokeDraw 1.05s cubic-bezier(0.65, 0, 0.35, 1) forwards;
  }

  .splash-line-logo .logo-detail {
    stroke-width: 3.2;
    stroke: #ffb456;
    animation-delay: 0.18s;
  }

  .splash-line-logo .logo-orbit {
    stroke-width: 2.6;
    stroke: rgba(255, 174, 66, 0.92);
    animation-delay: 0.45s;
  }

  .splash-brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 7px;
    transform: translateY(8px);
  }

  .splash-title {
    font-size: clamp(34px, 10vw, 42px);
    font-weight: 800;
    letter-spacing: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
    line-height: 1;
    text-shadow: 0 0 24px rgba(255, 107, 0, 0.22);
    animation: splashBrandIn 0.56s cubic-bezier(0.16, 1, 0.3, 1) 1.28s both;
  }

  .splash-title .white { color: #FFFFFF; }
  .splash-title .orange { color: #FF7A1A; }

  .splash-tagline {
    font-size: 12px;
    font-weight: 700;
    color: #a2a2a7;
    letter-spacing: 2.8px;
    text-transform: uppercase;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
    animation: splashBrandIn 0.48s ease-out 1.48s both;
  }

  .splash-progress {
    position: relative;
    width: min(178px, 46vw);
    height: 2px;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    box-shadow: 0 0 18px rgba(255, 107, 0, 0.14);
    animation: splashFadeIn 0.35s ease 1.6s both;
  }

  .splash-progress::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(90deg, transparent, #ff7a1a 16%, #ffd399 72%, transparent);
    transform: translateX(-105%);
    animation: splashProgressLoad 0.96s cubic-bezier(0.76, 0, 0.24, 1) 1.75s forwards;
  }

  @keyframes splashStrokeDraw {
    to { stroke-dashoffset: 0; }
  }

  @keyframes splashFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  @keyframes splashLogoFill {
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes splashBrandIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes splashOrbitIn {
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes splashProgressLoad {
    to { transform: translateX(105%); }
  }

  @keyframes splashGlowIn {
    to { opacity: 1; }
  }

  @keyframes splashGridDrift {
    from { transform: perspective(620px) rotateX(64deg) translateY(9%); }
    to { transform: perspective(620px) rotateX(64deg) translateY(4%); }
  }

  @keyframes splashFadeOut {
    to {
      opacity: 0;
      transform: scale(1.018);
      filter: blur(9px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .splash-screen,
    .splash-screen::before,
    .splash-screen::after,
    .splash-logo-stage::before,
    .splash-logo-stage::after,
    .splash-logo-fill,
    .splash-line-logo path,
    .splash-title,
    .splash-tagline,
    .splash-progress,
    .splash-progress::before {
      animation-duration: 0.01ms !important;
      animation-delay: 0ms !important;
    }
  }
`;

export default function SplashScreen({ onComplete, ready = true }) {
  const [fadingOut, setFadingOut] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);

  // Keep a stable ref so re-renders in App.jsx that create a new onComplete
  // function don't cancel the fade-out timer via effect cleanup.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    const introTimer = setTimeout(() => setIntroComplete(true), 2450);
    return () => clearTimeout(introTimer);
  }, []);

  useEffect(() => {
    if (!ready || !introComplete || fadingOut) return undefined;

    setFadingOut(true);
    const doneTimer = setTimeout(() => onCompleteRef.current(), 560);
    return () => clearTimeout(doneTimer);
  }, [fadingOut, introComplete, ready]); // onComplete intentionally excluded — use ref

  return (
    <>
      <style>{styles}</style>
      <div className={`splash-screen${fadingOut ? ' fading-out' : ''}`} role="status" aria-label="Loading LiveHoops">
        <div className="splash-logo-stage" aria-hidden="true">
          <img className="splash-logo-fill" src="/icon-512.png" alt="" />
          <svg className="splash-line-logo" viewBox="0 0 160 160">
            <path pathLength="1" d="M80 16 C50 16 30 39 30 65 C30 100 67 118 80 147 C93 118 130 100 130 65 C130 39 110 16 80 16Z" />
            <path className="logo-detail" pathLength="1" d="M80 25 L80 124" />
            <path className="logo-detail" pathLength="1" d="M36 66 C50 52 65 47 76 47" />
            <path className="logo-detail" pathLength="1" d="M124 66 C110 52 95 47 84 47" />
            <path className="logo-detail" pathLength="1" d="M36 83 C52 70 59 68 71 57" />
            <path className="logo-detail" pathLength="1" d="M124 83 C108 70 101 68 89 57" />
            <path className="logo-orbit" pathLength="1" d="M25 112 C43 134 117 134 135 112" />
            <path className="logo-orbit" pathLength="1" d="M40 102 C57 116 103 116 120 102" />
          </svg>
        </div>

        <div className="splash-brand">
          <div className="splash-title">
            <span className="white">Live</span>
            <span className="orange">Hoops</span>
          </div>
          <div className="splash-tagline">Find your run</div>
        </div>

        <div className="splash-progress" aria-hidden="true" />
      </div>
    </>
  );
}
