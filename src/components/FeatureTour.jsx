// src/components/FeatureTour.jsx
//
// The 6-slide "How LiveHoops Works" feature tour.
//
// Two consumers share the slide content defined here:
//   1. Onboarding.jsx splices FEATURE_SLIDES into its first-sign-up slide
//      strip (rendering each with <FeatureSlide/>), so new users walk the
//      tour once between the Welcome and Location screens.
//   2. The default export <FeatureTour/> is a standalone full-screen
//      overlay opened from Settings → Support → "How LiveHoops Works",
//      so anyone can revisit the tour later. It layers over the settings
//      sheet the same way LegalSheet does.
//
// Slide visuals reuse the existing onboarding CSS (.onboarding-heading,
// .onboarding-subtext, .onboarding-install-steps card rows) so the tour
// looks native to the flow it lives in.
//
// The slide content itself lives in src/data/featureSlides.js (kept
// separate so this file only exports components — react-refresh rule).

import { useState } from 'react';
import { FEATURE_SLIDES } from '../data/featureSlides';

// ── One slide's inner content ────────────────────────────────────────────────
// The consumer supplies the .onboarding-slide wrapper (Onboarding needs to
// control each slide's width inside its strip).
export function FeatureSlide({ slide }) {
  return (
    <>
      <div className="onboarding-icon">{slide.icon}</div>

      <h1 className="onboarding-heading">{slide.heading}</h1>

      <p className="onboarding-subtext">{slide.sub}</p>

      {/* Highlight cards — same card row style as the iOS install steps,
          with an emoji badge instead of a number */}
      <div className="onboarding-install-steps">
        {slide.points.map(point => (
          <div key={point.text} className="onboarding-install-step">
            <span className="onboarding-tour-point-icon">{point.icon}</span>
            <span>{point.text}</span>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Standalone tour overlay (Settings → "How LiveHoops Works") ──────────────
export default function FeatureTour({ onClose }) {
  const [step, setStep] = useState(0);

  const slides   = FEATURE_SLIDES;
  const isLast   = step === slides.length - 1;
  const slidePct = 100 / slides.length;

  return (
    <div className="feature-tour-wrap">
      <div className="onboarding-inner">

        {/* Header: title + close */}
        <div className="feature-tour-header">
          <span className="feature-tour-title">How LiveHoops Works</span>
          <button
            className="feature-tour-close"
            onClick={onClose}
            aria-label="Close tour"
          >
            ✕
          </button>
        </div>

        {/* Sliding strip — same dynamic geometry as Onboarding */}
        <div className="onboarding-strip-wrap">
          <div
            className="onboarding-strip"
            style={{
              width: `${slides.length * 100}%`,
              transform: `translateX(-${step * slidePct}%)`,
            }}
          >
            {slides.map(slide => (
              <div
                key={slide.key}
                className="onboarding-slide"
                style={{ width: `${slidePct}%` }}
              >
                <FeatureSlide slide={slide} />
              </div>
            ))}
          </div>
        </div>

        {/* Dots + navigation */}
        <div className="onboarding-bottom">
          <div className="onboarding-dots">
            {slides.map((slide, i) => (
              <div
                key={slide.key}
                className={`onboarding-dot${step === i ? ' active' : ''}`}
              />
            ))}
          </div>

          <button
            className="auth-submit-btn"
            onClick={() => (isLast ? onClose() : setStep(s => s + 1))}
          >
            {isLast ? 'Done' : 'Next'}
          </button>

          {step > 0 && (
            <button
              className="onboarding-skip-link"
              onClick={() => setStep(s => s - 1)}
            >
              Back
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
