export default function ThemeToggle({ isDark, onToggle }) {
  return (
    <div
      onClick={onToggle}
      role="switch"
      aria-checked={isDark}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        background: 'var(--bg-elevated)',
        borderRadius: 20,
        padding: 3,
        width: 80,
        height: 36,
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'background 0.3s ease',
        border: '1px solid var(--separator-strong)',
      }}
    >
      {/* Sliding orange circle */}
      <div
        style={{
          position: 'absolute',
          left: 3,
          width: 30,
          height: 30,
          borderRadius: '50%',
          background: 'var(--orange)',
          transform: isDark ? 'translateX(0px)' : 'translateX(44px)',
          transition: 'transform 0.3s ease',
          zIndex: 1,
          boxShadow: '0 2px 8px rgba(255, 107, 0, 0.45)',
        }}
      />

      {/* Moon — left (dark mode) */}
      <span
        style={{
          position: 'absolute',
          left: 9,
          fontSize: 14,
          zIndex: 2,
          opacity: isDark ? 1 : 0.45,
          transition: 'opacity 0.25s ease',
          userSelect: 'none',
        }}
      >
        🌙
      </span>

      {/* Sun — right (light mode) */}
      <span
        style={{
          position: 'absolute',
          right: 9,
          fontSize: 14,
          zIndex: 2,
          opacity: isDark ? 0.45 : 1,
          transition: 'opacity 0.25s ease',
          userSelect: 'none',
        }}
      >
        ☀️
      </span>
    </div>
  );
}
