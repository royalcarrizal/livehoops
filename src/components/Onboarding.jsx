// src/components/Onboarding.jsx
//
// This is the first-time welcome flow that new users see after signing up.
// It runs once and never shows again (tracked with 'lh_onboarded' in localStorage).
// There are 3 screens: Welcome, Location permission, and Ready to play.
// The screens slide left/right using a CSS animation — no libraries needed.

import { useState, useEffect } from 'react';
import { MapPin, CheckCircle, Trophy } from 'lucide-react';

export default function Onboarding({ profile, onComplete }) {
  // Which screen we're on: 0 = Welcome, 1 = Location, 2 = Ready
  const [step, setStep] = useState(0);

  // True while we're waiting for the browser to ask about location
  const [locationLoading, setLocationLoading] = useState(false);

  // The username to display on screen 3. Falls back to 'Player' if not loaded yet.
  const username = profile?.username || 'Player';

  // ── Auto-advance past location screen if already granted ─────────────────
  // When the user lands on screen 1, check if they already said "yes" to
  // location in a previous session. If so, skip the request and go to screen 2.
  useEffect(() => {
    if (step !== 1) return;

    // navigator.permissions is not available in all browsers (e.g. some older Safari),
    // so we wrap it in a try/catch just in case.
    try {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((result) => {
          if (result.state === 'granted') {
            setStep(2);
          }
        })
        .catch(() => {
          // If the permission query fails, just stay on the screen and let
          // the user tap the button manually — no big deal.
        });
    } catch {
      // Same fallback: stay on screen 1 if the API isn't available
    }
  }, [step]);

  // ── Location request handler ──────────────────────────────────────────────
  // Called when the user taps "Allow Location". We ask for their position and
  // then advance to screen 3 — whether they allow OR deny. We don't block them.
  const handleAllowLocation = () => {
    setLocationLoading(true);

    const advance = () => setStep(2);

    navigator.geolocation.getCurrentPosition(advance, advance, {
      timeout: 8000,
      maximumAge: 60000,
    });
  };

  // ── Completion handler ────────────────────────────────────────────────────
  // Called when the user picks a starting screen on screen 3.
  // We mark onboarding as done in localStorage so it never shows again,
  // then tell App.jsx which tab to open first.
  const complete = (startScreen) => {
    localStorage.setItem('lh_onboarded', 'true');
    onComplete(startScreen);
  };

  // ── Sliding strip offset ──────────────────────────────────────────────────
  // The strip is 300% wide and holds all 3 screens side by side.
  // Moving it left by (step * 33.333%) shows the right screen.
  const stripOffset = `${step * 33.333}%`;

  return (
    <div className="onboarding-wrap">
      <div className="onboarding-inner">

        {/* ── Sliding screens ─────────────────────────────────────────────── */}
        <div className="onboarding-strip-wrap">
          <div
            className="onboarding-strip"
            style={{ transform: `translateX(-${stripOffset})` }}
          >

            {/* ── Screen 0: Welcome ────────────────────────────────────── */}
            <div className="onboarding-slide">
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

            {/* ── Screen 1: Location ───────────────────────────────────── */}
            <div className="onboarding-slide">
              <div className="onboarding-icon">📍</div>

              <h1 className="onboarding-heading">Find courts near you</h1>

              <p className="onboarding-subtext">
                LiveHoops uses your location to show nearby courts and verify
                check-ins. We never share your location with other users.
              </p>
            </div>

            {/* ── Screen 2: Ready ──────────────────────────────────────── */}
            <div className="onboarding-slide">
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
        {/* This stays fixed at the bottom while the screens slide above */}
        <div className="onboarding-bottom">

          {/* Progress dots — 3 dots showing current position */}
          <div className="onboarding-dots">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`onboarding-dot${step === i ? ' active' : ''}`}
              />
            ))}
          </div>

          {/* ── Screen 0 buttons ─────────────────────────────────────────── */}
          {step === 0 && (
            <button
              className="auth-submit-btn"
              onClick={() => setStep(1)}
            >
              Let's Go
            </button>
          )}

          {/* ── Screen 1 buttons ─────────────────────────────────────────── */}
          {step === 1 && (
            <>
              <button
                className="auth-submit-btn"
                onClick={handleAllowLocation}
                disabled={locationLoading}
              >
                {locationLoading ? '...' : 'Allow Location'}
              </button>
              <button
                className="onboarding-skip-link"
                onClick={() => setStep(2)}
              >
                Skip for now
              </button>
            </>
          )}

          {/* ── Screen 2 buttons ─────────────────────────────────────────── */}
          {step === 2 && (
            <>
              <button
                className="auth-submit-btn"
                onClick={() => complete('map')}
              >
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
