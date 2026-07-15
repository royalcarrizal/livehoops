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

// ── Age from a birth date, for the supervision notice below ─────────────────
// Pure client-side arithmetic — the date itself is never sent anywhere (not
// included in the onSignUp call, so it never reaches Supabase). Returns null
// for an unparseable/empty date.
function calculateAge(dateStr) {
  if (!dateStr) return null;
  const dob = new Date(dateStr);
  if (Number.isNaN(dob.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const hadBirthdayThisYear =
    now.getMonth() > dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate());
  if (!hadBirthdayThisYear) age--;

  return age;
}

export default function AuthScreen({ onSignUp, onSignIn, onResetPassword }) {
  // Which form is showing: 'login' or 'signup'
  const [mode, setMode] = useState('login');

  // Form field values
  const [username, setUsername]             = useState('');
  const [birthDate, setBirthDate]           = useState('');
  const [email, setEmail]                   = useState('');
  const [password, setPassword]             = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Birth date is collected only to decide whether to show the supervision
  // notice below — it's never persisted or sent to onSignUp. Doesn't block
  // account creation at any age; see supabase/block_users.sql's sibling
  // decision notes in the safety-table plan for why.
  const age = calculateAge(birthDate);
  const showYoungNotice = age !== null && age <= 12;

  // UI state
  const [error, setError]         = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  // True after a successful sign-up that requires email confirmation —
  // the account exists but the user must click the emailed link before
  // Supabase will log them in.
  const [confirmSent, setConfirmSent] = useState(false);

  // ── Switch between Login and Sign Up ─────────────────────────────────
  const switchMode = (newMode) => {
    setMode(newMode);
    setError('');
    setResetSent(false);
    setConfirmSent(false);
  };

  // ── Handle form submission ───────────────────────────────────────────
  const handleSubmit = async (e) => {
    // e.preventDefault() stops the browser from refreshing the page when
    // the form is submitted — React handles submission in JavaScript instead
    e.preventDefault();
    setError('');
    setResetSent(false);
    setConfirmSent(false);

    // ── Client-side validation ────────────────────────────────────────
    // Check for obvious problems before sending anything to the server.
    // This gives instant feedback instead of waiting for a network round trip.
    if (!email.trim()) {
      setError(mode === 'signup'
        ? 'Please enter your email address.'
        : 'Please enter your email or username.');
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
      // Required so the supervision notice below gets a chance to show for
      // every signup — the VALUE never blocks anything, only a missing date.
      if (!birthDate) {
        setError('Please enter your birth date.');
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
    } else if (result.needsConfirmation) {
      // Email confirmation is enabled in Supabase: the account was created
      // but there's no session until they click the emailed link (which
      // opens the app already logged in). Show them where to go next.
      setConfirmSent(true);
    }
    // Otherwise the auth state change in useAuth will automatically
    // cause App.jsx to re-render and show the main app instead of this screen
  };

  // ── Forgot password handler ─────────────────────────────────────────
  const handleForgotPassword = async () => {
    setError('');
    if (!email.trim()) {
      setError('Enter your email or username above, then tap "Forgot password?" again.');
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

        {/* Birth date — signup only. Used only to decide whether to show the
            supervision notice below; never sent to onSignUp or stored. */}
        {mode === 'signup' && (
          <div>
            <p className="auth-field-hint">
              So we can let younger players know to have a parent or guardian nearby
            </p>
            <input
              style={inputStyle}
              type="date"
              aria-label="Birth date"
              value={birthDate}
              onChange={e => setBirthDate(e.target.value)}
              autoComplete="bday"
              max={new Date().toISOString().slice(0, 10)}
            />
          </div>
        )}

        {/* Supervision notice — informational only, never blocks Create
            Account. Shown as soon as a birth date making someone 12 or
            under is entered. */}
        {mode === 'signup' && showYoungNotice && (
          <div className="auth-notice">
            LiveHoops is best experienced with a parent or guardian nearby for
            players 12 and under.
          </div>
        )}

        {/* Identifier field — shown on both forms. On signup it's the account
            email; on login it accepts an email OR a username (resolved to the
            email by useAuth.signIn), so it uses type="text" there. */}
        <input
          style={inputStyle}
          type={mode === 'signup' ? 'email' : 'text'}
          placeholder={mode === 'signup' ? 'Email' : 'Email or username'}
          value={email}
          onChange={e => setEmail(e.target.value)}
          autoComplete={mode === 'signup' ? 'email' : 'username'}
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

        {/* ── Email confirmation notice (sign-up with confirmation enabled) ── */}
        {confirmSent && (
          <div className="auth-success">
            ✅ Account created! Check your email and tap the confirmation
            link to start playing.
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
          <>
            <button
              type="button"
              className="auth-link"
              onClick={handleForgotPassword}
              disabled={submitting}
            >
              {submitting ? 'Sending…' : 'Forgot password?'}
            </button>
            {resetSent && (
              <div className="auth-success">
                ✅ Reset email sent! Check your inbox (and spam folder).
              </div>
            )}
          </>
        )}
      </form>
    </div>
  );
}
