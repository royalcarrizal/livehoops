const NAMED_SIZES = { small: 32, medium: 48, large: 80 };
const DOT_SIZES   = { small: 10, medium: 12, large: 14 };
const FONT_SIZES  = { small: 11, medium: 16, large: 28 };

const PALETTE = [
  { bg: '#FF6B1A', text: '#fff' },
  { bg: '#30D158', text: '#fff' },
  { bg: '#0A84FF', text: '#fff' },
  { bg: '#BF5AF2', text: '#fff' },
  { bg: '#FF375F', text: '#fff' },
  { bg: '#FFD60A', text: '#000' },
];

function hashInitials(initials = '') {
  let sum = 0;
  for (let i = 0; i < initials.length; i++) sum += initials.charCodeAt(i);
  return PALETTE[sum % PALETTE.length];
}

/**
 * Avatar — reusable avatar component
 *
 * Props:
 *   avatarUrl     {string|null}  — photo URL; falls back to initials if null/undefined
 *   initials      {string}       — 1–2 letter fallback
 *   size          {'small'|'medium'|'large'|number} — named size or exact px number
 *   showOnlineDot {bool}         — show online/offline status dot
 *   isOnline      {bool}         — green dot if true, gray if false (requires showOnlineDot)
 *   isCheckedIn   {bool}         — orange outline ring when checked in to a court
 *   cameraOverlay {bool}         — show 📷 overlay (profile edit tap target)
 *   ringColor     {string}       — border color for avatar-stack overlap (e.g. 'var(--bg-card)')
 */
export default function Avatar({
  avatarUrl,
  initials = '?',
  size = 'medium',
  showOnlineDot = false,
  isOnline = false,
  isCheckedIn = false,
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

  const { bg, text } = hashInitials(initials);

  const sharedStyle = {
    width: dim,
    height: dim,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'block',
    ...(isCheckedIn && { outline: '2px solid #FF6B1A', outlineOffset: 2 }),
    ...(ringColor && { border: `2px solid ${ringColor}` }),
  };

  return (
    <div style={{ position: 'relative', width: dim, height: dim, flexShrink: 0 }}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={initials}
          style={{ ...sharedStyle, objectFit: 'cover' }}
        />
      ) : (
        <div
          style={{
            ...sharedStyle,
            background: bg,
            color: text,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize,
            fontWeight: 700,
            fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
            userSelect: 'none',
          }}
        >
          {initials}
        </div>
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
            background: isOnline ? '#30D158' : '#636366',
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
