// src/components/ErrorBoundary.jsx
//
// Catches any unexpected crash in the React component tree below it and shows
// a friendly recovery screen instead of a blank white (well, black) page.
//
// Without this, a single thrown error anywhere in the app unmounts the whole
// UI and leaves the user staring at an empty screen with no way out but to
// force-quit. With it, they get a "Something went wrong" screen and a button
// to reload — and we log the error (where a tool like Sentry can pick it up
// later).
//
// Error boundaries have to be class components — React only exposes the
// crash lifecycle hooks (getDerivedStateFromError / componentDidCatch) to
// classes, there's no hook equivalent.

import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  // Runs when a descendant throws during render — flips us into the
  // fallback UI on the next render.
  static getDerivedStateFromError() {
    return { hasError: true };
  }

  // Runs after a crash is caught — the place to report the error. Kept as
  // console.error for now so a future Sentry/logging integration can hook in.
  componentDidCatch(error, info) {
    console.error('[LiveHoops] Uncaught UI error:', error, info?.componentStack);
  }

  handleReload = () => {
    // Full reload — the component tree is in an unknown state after a crash,
    // so a clean reload is the safest recovery.
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '32px 24px',
          background: '#000',
          color: '#fff',
          fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: 56, marginBottom: 16 }}>🏀</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: 15, color: '#8E8E93', maxWidth: 300, lineHeight: 1.5, margin: '0 0 24px' }}>
          The app hit an unexpected snag. Reloading usually fixes it.
        </p>
        <button
          onClick={this.handleReload}
          style={{
            background: '#FF6B00',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            padding: '13px 28px',
            fontSize: 16,
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          Reload LiveHoops
        </button>
      </div>
    );
  }
}
