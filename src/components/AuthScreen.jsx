// src/components/AuthScreen.jsx
//
// This is the login / sign-up screen. It shows when no user is logged in
// and blocks access to the rest of the app until they authenticate.
//
// Two modes:
//   "signup" — new users create an account (username + email + password)
//   "login"  — existing users log back in (email + password)
//
// It also has a "Forgot password?" link that sends a reset email via Supabase.

import { useState } from 'react';

export default function AuthScreen({ onSignUp, onSignIn, onResetPassword }) {
  // Which form is showing: 'login' or 'signup'
  const [mode, setMode] = useState('login');

  // Form field values
  const [username, setUsername]             = useState('');
  const [email, setEmail]                   = useState('');
  const [password, setPassword]             = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // UI state
  const [error, setError]         = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // ── Switch between Login and Sign Up ─────────────────────────────────
  const switchMode = (newMode) => {
    setMode(newMode);
    setError('');
    setResetSent(false);
  };

  // ── Handle form submission ───────────────────────────────────────────
  const handleSubmit = async (e) => {
    // e.preventDefault() stops the browser from refreshing the page when
    // the form is submitted — React handles submission in JavaScript instead
    e.preventDefault();
    setError('');
    setResetSent(false);

    // ── Client-side validation ────────────────────────────────────────
    // Check for obvious problems before sending anything to the server.
    // This gives instant feedback instead of waiting for a network round trip.
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    if (!password) {
      setError('Please enter a password.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (mode === 'signup') {
      if (!username.trim()) {
        setError('Please choose a username.');
        return;
      }
      if (username.trim().length < 2) {
        setError('Username must be at least 2 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords don\'t match.');
        return;
      }
    }

    // ── Send to Supabase ──────────────────────────────────────────────
    setSubmitting(true);

    let result;
    if (mode === 'signup') {
      result = await onSignUp(email.trim(), password, username.trim());
    } else {
      result = await onSignIn(email.trim(), password);
    }

    setSubmitting(false);

    if (result.error) {
      setError(result.error);
    }
    // If no error, the auth state change in useAuth will automatically
    // cause App.jsx to re-render and show the main app instead of this screen
  };

  // ── Forgot password handler ─────────────────────────────────────────
  const handleForgotPassword = async () => {
    setError('');
    if (!email.trim()) {
      setError('Enter your email above, then tap "Forgot password?" again.');
      return;
    }

    setSubmitting(true);
    const result = await onResetPassword(email.trim());
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
    } else {
      setResetSent(true);
    }
  };

  // Shared input style — matches the app's dark theme
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
        <span className="auth-emoji">🏀</span>
        <h1 className="app-title" style={{ fontSize: 32 }}>
          Live<span>Hoops</span>
        </h1>
        <p className="auth-tagline">Find your run.</p>
      </div>

      {/* ── Tab Toggle (Sign Up / Log In) ────────────────────────────────── */}
      <div className="feed-tab-row" style={{ margin: '0 0 20px' }}>
        <button
          className={`feed-tab-btn${mode === 'signup' ? ' active' : ''}`}
          onClick={() => switchMode('signup')}
        >
          Sign Up
        </button>
        <button
          className={`feed-tab-btn${mode === 'login' ? ' active' : ''}`}
          onClick={() => switchMode('login')}
        >
          Log In
        </button>
      </div>

      {/* ── Form ─────────────────────────────────────────────────────────── */}
      <form className="auth-form" onSubmit={handleSubmit}>

        {/* Username field — only shown during sign up */}
        {mode === 'signup' && (
          <input
            style={inputStyle}
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            maxLength={30}
          />
        )}

        {/* Email field — shown on both forms */}
        <input
          style={inputStyle}
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          autoComplete="email"
        />

        {/* Password field — shown on both forms */}
        <input
          style={inputStyle}
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        />

        {/* Confirm password — only shown during sign up */}
        {mode === 'signup' && (
          <input
            style={inputStyle}
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        )}

        {/* ── Error message ──────────────────────────────────────────────── */}
        {error && <div className="auth-error">{error}</div>}

        {/* ── Password reset success message ─────────────────────────────── */}
        {resetSent && (
          <div className="auth-success">
            Check your email for a password reset link.
          </div>
        )}

        {/* ── Submit button ──────────────────────────────────────────────── */}
        <button
          type="submit"
          className="auth-submit-btn"
          disabled={submitting}
        >
          {submitting
            ? '...'
            : mode === 'signup' ? 'Create Account' : 'Log In'
          }
        </button>

        {/* ── Forgot password link — only on login form ──────────────────── */}
        {mode === 'login' && (
          <button
            type="button"
            className="auth-link"
            onClick={handleForgotPassword}
            disabled={submitting}
          >
            Forgot password?
          </button>
        )}
      </form>
    </div>
  );
}
