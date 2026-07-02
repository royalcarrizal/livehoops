// src/components/ResetPasswordScreen.jsx
//
// The "Set New Password" screen. Shown when the user arrives from a
// password-reset email link — Supabase logs them in with a temporary
// recovery session and fires PASSWORD_RECOVERY (handled in useAuth),
// and App.jsx renders this screen instead of the main app.
//
// Flow:
//   1. User enters a new password (twice) and taps Save
//   2. onUpdatePassword saves it to Supabase
//   3. Success state shows, then "Start Hooping" calls onDone to enter the app

import { useState } from 'react';

export default function ResetPasswordScreen({ onUpdatePassword, onDone }) {
  // Form field values
  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // UI state
  const [error, setError]           = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved]           = useState(false);

  // ── Handle form submission ───────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Client-side validation — instant feedback before hitting the server
    if (!password) {
      setError('Please enter a new password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords don\'t match.');
      return;
    }

    setSubmitting(true);
    const result = await onUpdatePassword(password);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
    } else {
      setSaved(true);
    }
  };

  // Shared input style — matches AuthScreen's dark theme inputs
  const inputStyle = {
    width: '100%',
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    border: '1px solid var(--separator-strong)',
    borderRadius: 12,
    padding: '12px 14px',
    fontSize: 15,
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div className="auth-screen">
      {/* ── Logo / Title ─────────────────────────────────────────────────── */}
      <div className="auth-logo">
        <span className="auth-emoji">🔒</span>
        <h1 className="app-title" style={{ fontSize: 32 }}>
          Live<span>Hoops</span>
        </h1>
        <p className="auth-tagline">
          {saved ? 'Password updated.' : 'Set your new password.'}
        </p>
      </div>

      {saved ? (
        // ── Success state ─────────────────────────────────────────────────
        <div className="auth-form">
          <div className="auth-success">
            ✅ Your password has been changed. Use it next time you log in.
          </div>
          <button
            type="button"
            className="auth-submit-btn"
            onClick={onDone}
          >
            Start Hooping
          </button>
        </div>
      ) : (
        // ── New password form ─────────────────────────────────────────────
        <form className="auth-form" onSubmit={handleSubmit}>
          <input
            style={inputStyle}
            type="password"
            placeholder="New Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
            autoFocus
          />

          <input
            style={inputStyle}
            type="password"
            placeholder="Confirm New Password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />

          {error && <div className="auth-error">{error}</div>}

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={submitting}
          >
            {submitting ? 'Saving…' : 'Save New Password'}
          </button>

          {/* Escape hatch — the recovery link already logged them in, so
              they can skip and keep their old password if they remember it */}
          <button
            type="button"
            className="auth-link"
            onClick={onDone}
            disabled={submitting}
          >
            Skip — I remember my password
          </button>
        </form>
      )}
    </div>
  );
}
