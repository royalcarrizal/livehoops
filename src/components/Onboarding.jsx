// src/components/Onboarding.jsx
//
// The first-time welcome flow shown once after sign-up (tracked with
// 'lh_onboarded' in localStorage). Screens slide left/right via a CSS
// transform — no libraries needed.
//
// Screens: Welcome → 6-slide feature tour → Location → [Add to Home Screen]
// → Ready. The feature tour ("How LiveHoops Works") is defined once in
// FeatureTour.jsx and shared with the Settings → Support entry that lets
// users revisit it later; a "Skip tour" link jumps straight to Location.
// The "Add to Home Screen" screen only appears for iPhone/iPad users in
// Safari who haven't installed the app yet — iOS is the one platform with
// no native install prompt, and iOS push notifications REQUIRE the app be
// added to the home screen. Android/desktop and already-installed users
// never see it (the instructions would just confuse them).

import { useState, useEffect, useMemo } from 'react';
import { MapPin, CheckCircle, Trophy, Share, Plus } from 'lucide-react';
import { FeatureSlide } from './FeatureTour';
import { FEATURE_SLIDES } from '../data/featureSlides';

// ── Should we show the iOS "Add to Home Screen" screen? ─────────────────────
// True only on an iPhone/iPad, in Safari (other iOS browsers can't add to the
// home screen), and not already running as an installed PWA.
function shouldShowIosInstall() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;

  // iPhone/iPod, or iPad — modern iPadOS reports as "Macintosh" but is the
  // only Mac-like device with a touch screen, so maxTouchPoints disambiguates.
  const isIos =
    /iphone|ipod|ipad/i.test(ua) ||
    (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  if (!isIos) return false;

  // Only Safari offers Share → Add to Home Screen. Chrome/Firefox/Edge on iOS
  // (crios/fxios/edgios) don't, so showing them these steps would be wrong.
  const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
  if (!isSafari) return false;

  // Already installed — navigator.standalone is the iOS-specific signal;
  // display-mode covers the standard case.
  const isStandalone =
    navigator.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches;
  return !isStandalone;
}

export default function Onboarding({ profile, onComplete }) {
  // The ordered list of screens for THIS device. The iOS install screen is
  // spliced in only where relevant, so numeric steps stay in sync with what's
  // actually rendered. Computed once — the device doesn't change mid-session.
  const slides = useMemo(() => {
    const showInstall = shouldShowIosInstall();
    return [
      'welcome',
      // The 6-slide feature tour (shared with Settings via FeatureTour.jsx)
      ...FEATURE_SLIDES.map(s => s.key),
      'location',
      ...(showInstall ? ['install'] : []),
      'ready',
    ];
  }, []);

  // Which screen we're on, by index into `slides`.
  const [step, setStep] = useState(0);
  const current = slides[step];

  // True while we're waiting for the browser to answer the location prompt.
  const [locationLoading, setLocationLoading] = useState(false);

  // Shown on the Ready screen. Falls back to 'Player' if not loaded yet.
  const username = profile?.username || 'Player';

  // Advance to the next screen (clamped to the last).
  const goNext = () => setStep(s => Math.min(s + 1, slides.length - 1));

  // Is the current screen one of the 6 feature-tour slides?
  const isTourSlide = current?.startsWith('tour_');

  // "Skip tour" jumps straight to the Location screen.
  const skipTour = () => setStep(slides.indexOf('location'));

  // ── Auto-advance past the Location screen if already granted ──────────────
  // If the user already allowed location in a previous session, don't make
  // them tap the button again — move straight to the next screen.
  useEffect(() => {
    if (current !== 'location') return;
    try {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((result) => { if (result.state === 'granted') goNext(); })
        .catch(() => {}); // query unsupported — leave them on the screen
    } catch {
      // navigator.permissions missing (older Safari) — same fallback
    }
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Location request ──────────────────────────────────────────────────────
  // Ask for position, then advance whether they allow OR deny — we never block.
  const handleAllowLocation = () => {
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(goNext, goNext, {
      timeout: 8000,
      maximumAge: 60000,
    });
  };

  // ── Completion ────────────────────────────────────────────────────────────
  // Mark onboarding done so it never shows again, then tell App.jsx which tab
  // to open first.
  const complete = (startScreen) => {
    localStorage.setItem('lh_onboarded', 'true');
    onComplete(startScreen);
  };

  // ── Sliding strip geometry ────────────────────────────────────────────────
  // The strip holds every screen side by side. Its width and each slide's
  // width scale with the slide count (3 or 4) so the transform math works for
  // both, overriding the fixed 300% / 33.333% defaults in index.css.
  const slidePct  = 100 / slides.length;
  const stripStyle = {
    width: `${slides.length * 100}%`,
    transform: `translateX(-${step * slidePct}%)`,
  };
  const slideStyle = { width: `${slidePct}%` };

  return (
    <div className="onboarding-wrap">
      <div className="onboarding-inner">

        {/* ── Sliding screens ─────────────────────────────────────────────── */}
        <div className="onboarding-strip-wrap">
          <div className="onboarding-strip" style={stripStyle}>

            {/* ── Welcome ──────────────────────────────────────────────── */}
            <div className="onboarding-slide" style={slideStyle}>
              <div className="onboarding-icon">🏀</div>

              <h1 className="onboarding-heading">Welcome to LiveHoops</h1>

              <p className="onboarding-subtext">
                The app that shows you which courts are live near you in real time
              </p>

              {/* Three feature highlights in a row */}
              <div className="onboarding-feature-row">
                <div className="onboarding-feature-item">
                  <MapPin size={18} color="var(--orange)" strokeWidth={2} />
                  <span className="onboarding-feature-label">Live Courts</span>
                </div>
                <div className="onboarding-feature-item">
                  <CheckCircle size={18} color="var(--orange)" strokeWidth={2} />
                  <span className="onboarding-feature-label">Check In</span>
                </div>
                <div className="onboarding-feature-item">
                  <Trophy size={18} color="var(--orange)" strokeWidth={2} />
                  <span className="onboarding-feature-label">King of the Court</span>
                </div>
              </div>
            </div>

            {/* ── Feature tour (6 slides, shared with Settings) ────────── */}
            {FEATURE_SLIDES.map(slide => (
              <div key={slide.key} className="onboarding-slide" style={slideStyle}>
                <FeatureSlide slide={slide} />
              </div>
            ))}

            {/* ── Location ─────────────────────────────────────────────── */}
            <div className="onboarding-slide" style={slideStyle}>
              <div className="onboarding-icon">📍</div>

              <h1 className="onboarding-heading">Find courts near you</h1>

              <p className="onboarding-subtext">
                LiveHoops uses your location to show nearby courts and verify
                check-ins. Only the court you check into is ever shared — never
                your exact location — and you can hide that too in Settings.
              </p>
            </div>

            {/* ── Add to Home Screen (iOS Safari only) ─────────────────── */}
            {slides.includes('install') && (
              <div className="onboarding-slide" style={slideStyle}>
                <div className="onboarding-icon">📲</div>

                <h1 className="onboarding-heading">Add to your Home Screen</h1>

                <p className="onboarding-subtext">
                  Install LiveHoops for full-screen, one-tap access — and to get
                  notified the moment your crew hits the court.
                </p>

                {/* Numbered steps for the iOS Safari "Add to Home Screen" flow */}
                <div className="onboarding-install-steps">
                  <div className="onboarding-install-step">
                    <span className="onboarding-install-step-num">1</span>
                    <span>
                      Tap the Share button{' '}
                      <Share size={15} strokeWidth={2} style={{ verticalAlign: 'text-bottom' }} />{' '}
                      in Safari's toolbar
                    </span>
                  </div>
                  <div className="onboarding-install-step">
                    <span className="onboarding-install-step-num">2</span>
                    <span>
                      Scroll down and tap{' '}
                      <strong>Add to Home Screen</strong>{' '}
                      <Plus size={15} strokeWidth={2} style={{ verticalAlign: 'text-bottom' }} />
                    </span>
                  </div>
                  <div className="onboarding-install-step">
                    <span className="onboarding-install-step-num">3</span>
                    <span>
                      Tap <strong>Add</strong>, then open LiveHoops from your
                      Home Screen
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Ready ────────────────────────────────────────────────── */}
            <div className="onboarding-slide" style={slideStyle}>
              <div className="onboarding-icon">🏆</div>

              <h1 className="onboarding-heading">You're all set, {username}</h1>

              <p className="onboarding-subtext">
                Find a court, check in, and climb the leaderboard. The run starts now.
              </p>

              {/* Stat preview card showing starting stats (all zeros) */}
              <div className="onboarding-stat-preview">
                <div className="onboarding-stat-item">
                  <span className="onboarding-stat-value">0</span>
                  <span className="onboarding-stat-label">Check-ins</span>
                </div>
                <div className="onboarding-stat-item">
                  <span className="onboarding-stat-value">0</span>
                  <span className="onboarding-stat-label">Courts</span>
                </div>
                <div className="onboarding-stat-item">
                  <span className="onboarding-stat-value">0</span>
                  <span className="onboarding-stat-label">Hours</span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* ── Bottom area: dots + buttons ─────────────────────────────────── */}
        {/* Stays fixed at the bottom while the screens slide above */}
        <div className="onboarding-bottom">

          {/* Progress dots — one per screen for this device */}
          <div className="onboarding-dots">
            {slides.map((key, i) => (
              <div
                key={key}
                className={`onboarding-dot${step === i ? ' active' : ''}`}
              />
            ))}
          </div>

          {/* ── Welcome buttons ──────────────────────────────────────────── */}
          {current === 'welcome' && (
            <button className="auth-submit-btn" onClick={goNext}>
              Let's Go
            </button>
          )}

          {/* ── Feature tour buttons ─────────────────────────────────────── */}
          {isTourSlide && (
            <>
              <button className="auth-submit-btn" onClick={goNext}>
                Next
              </button>
              <button className="onboarding-skip-link" onClick={skipTour}>
                Skip tour
              </button>
            </>
          )}

          {/* ── Location buttons ─────────────────────────────────────────── */}
          {current === 'location' && (
            <>
              <button
                className="auth-submit-btn"
                onClick={handleAllowLocation}
                disabled={locationLoading}
              >
                {locationLoading ? '...' : 'Allow Location'}
              </button>
              <button className="onboarding-skip-link" onClick={goNext}>
                Skip for now
              </button>
            </>
          )}

          {/* ── Add to Home Screen buttons ───────────────────────────────── */}
          {current === 'install' && (
            <button className="auth-submit-btn" onClick={goNext}>
              Continue
            </button>
          )}

          {/* ── Ready buttons ────────────────────────────────────────────── */}
          {current === 'ready' && (
            <>
              <button className="auth-submit-btn" onClick={() => complete('map')}>
                Find a Court
              </button>
              <button
                className="onboarding-secondary-btn"
                onClick={() => complete('home')}
              >
                Go to Home Feed
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
