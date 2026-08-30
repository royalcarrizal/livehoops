import { avatarColorFor } from '../utils/avatarColors';

const NAMED_SIZES = { small: 32, medium: 48, large: 80 };
const DOT_SIZES   = { small: 10, medium: 12, large: 14 };
const FONT_SIZES  = { small: 11, medium: 16, large: 28 };

// ── Rings ──
//
// Two different rings, carrying two different claims, and it matters that they
// are not confused:
//
//   identity — accent → green, on your own large avatar (Profile, Edit Profile).
//     Decorative. It ties the app's two reserved colours together and is the
//     redesign's signature on the one avatar that is definitely yours.
//
//   live — green → deep green, on someone who is checked in at a court.
//     Load-bearing. This one states a fact about a person, which is why it is
//     green and only green: green means live/active and nothing else.
//
// Both are drawn as a padded wrapper rather than a border or an outline, so the
// gradient has a real box to fill — a border cannot carry one. The wrapper keeps
// the avatar's overall footprint at exactly `size` and insets the face instead,
// so adding a ring never shifts the layout around it.
const RING_GRADIENTS = {
  identity: 'linear-gradient(140deg, var(--accent), var(--green))',
  live:     'linear-gradient(140deg, var(--green), var(--green-deep))',
};

// The identity ring is a fixed 3px because it only ever appears at 80px+. The
// live ring turns up at every size down to a 24px comment avatar, where a flat
// 2px would read as a collar rather than a ring — so it scales, to the nearest
// half pixel, and stops at 3.
const ringWidthFor = (variant, dim) =>
  variant === 'identity' ? 3 : Math.max(1.5, Math.min(3, Math.round(dim * 0.09) / 2));

/**
 * Avatar — reusable avatar component
 *
 * Props:
 *   avatarUrl     {string|null}  — photo URL; falls back to initials if null/undefined
 *   initials      {string}       — 1–2 letter fallback
 *   size          {'small'|'medium'|'large'|number} — named size or exact px number
 *   showOnlineDot {bool}         — show online/offline status dot
 *   isOnline      {bool}         — green dot if true, gray if false (requires showOnlineDot)
 *   isCheckedIn   {bool}         — green gradient "live" ring when checked in to a court
 *   identityRing  {bool}         — accent→green ring; for your own large avatar.
 *                                  Takes precedence over isCheckedIn: on your own
 *                                  profile the check-in state is already stated by
 *                                  the screen itself, so the ring is free to be
 *                                  decorative rather than repeating it.
 *   cameraOverlay {bool}         — show 📷 overlay (profile edit tap target)
 *   ringColor     {string}       — border color for overlapping avatars (e.g. 'var(--bg-card)')
 */
export default function Avatar({
  avatarUrl,
  initials = '?',
  size = 'medium',
  showOnlineDot = false,
  isOnline = false,
  isCheckedIn = false,
  identityRing = false,
  cameraOverlay = false,
  ringColor,
}) {
  const dim     = typeof size === 'number' ? size : NAMED_SIZES[size] ?? 40;
  const dotSize = typeof size === 'number'
    ? Math.max(8, Math.round(dim * 0.3))
    : DOT_SIZES[size] ?? 10;
  const fontSize = typeof size === 'number'
    ? Math.max(9, Math.round(dim * 0.36))
    : FONT_SIZES[size] ?? 14;

  const { bg, text } = avatarColorFor(initials);

  const ring      = identityRing ? 'identity' : isCheckedIn ? 'live' : null;
  const ringWidth = ring ? ringWidthFor(ring, dim) : 0;

  // The face fills whatever box it is given — the ring's padding box when there
  // is a ring, the outer wrapper when there isn't — so one element serves both.
  const faceStyle = {
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    display: 'block',
    ...(ringColor && { border: `2px solid ${ringColor}` }),
  };

  const face = avatarUrl ? (
    <img src={avatarUrl} alt={initials} style={{ ...faceStyle, objectFit: 'cover' }} />
  ) : (
    <div
      style={{
        ...faceStyle,
        background: bg,
        color: text,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Scale the initials down with the face when a ring insets it, so a
        // ringed avatar doesn't crowd its own text against the gradient.
        fontSize: ring ? Math.max(9, Math.round(fontSize * (1 - (ringWidth * 2) / dim))) : fontSize,
        fontWeight: 700,
        fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
        userSelect: 'none',
      }}
    >
      {initials}
    </div>
  );

  return (
    <div style={{ position: 'relative', width: dim, height: dim, flexShrink: 0 }}>
      {ring ? (
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            padding: ringWidth,
            background: RING_GRADIENTS[ring],
            // The global reset sets border-box, which would eat the padding and
            // leave no ring at all. This is the one place that needs otherwise.
            boxSizing: 'border-box',
          }}
        >
          {face}
        </div>
      ) : (
        face
      )}

      {showOnlineDot && (
        <span
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: dotSize,
            height: dotSize,
            borderRadius: '50%',
            // Green means live/active — the same rule the live ring follows.
            background: isOnline ? 'var(--green)' : '#636366',
            border: '2px solid var(--bg-card)',
            boxSizing: 'border-box',
          }}
        />
      )}

      {cameraOverlay && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            pointerEvents: 'none',
          }}
        >
          📷
        </div>
      )}
    </div>
  );
}
