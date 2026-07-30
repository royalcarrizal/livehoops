import { MapPin, RefreshCw, UserRound } from 'lucide-react';
import Avatar from './Avatar';

export default function SharedCheckInLanding({
  data,
  loading,
  error,
  onRetry,
  onJoin,
  onLogin,
  signedIn = false,
}) {
  const isValid = data?.state === 'live' || data?.state === 'ended';
  const isLive = data?.state === 'live';
  const playerName = data?.player_name || 'A LiveHoops player';
  const initials = data?.player_name?.slice(0, 2).toUpperCase() || 'LH';
  const playedDate = data?.checked_in_at
    ? new Date(data.checked_in_at).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <main className="shared-checkin-landing">
      <div className="shared-checkin-brand">
        <div className="shared-checkin-ball">🏀</div>
        <h1 className="app-title">Live<span>Hoops</span></h1>
        <p>Find your run.</p>
      </div>

      <section className={`shared-checkin-card${isValid ? '' : ' shared-checkin-card--neutral'}`}>
        {loading ? (
          <div className="shared-checkin-state" aria-live="polite">
            <div className="shared-checkin-spinner" />
            <h2>Opening check-in…</h2>
            <p>Getting the latest run details.</p>
          </div>
        ) : error ? (
          <div className="shared-checkin-state">
            <div className="shared-checkin-state-icon">📡</div>
            <h2>We couldn’t load this invite</h2>
            <p>Check your connection and try again.</p>
            <button className="map-directions-btn shared-checkin-retry" onClick={onRetry}>
              <RefreshCw size={16} strokeWidth={2.2} />
              Try Again
            </button>
          </div>
        ) : isValid ? (
          <>
            <div className={`shared-checkin-status${isLive ? ' live' : ''}`}>
              {isLive && <span className="live-dot" />}
              {isLive ? 'Playing now' : 'Run recap'}
            </div>

            <div className="shared-checkin-player">
              {data.avatar_url ? (
                <Avatar avatarUrl={data.avatar_url} initials={initials} size="large" />
              ) : (
                <div className="shared-checkin-player-fallback">
                  <UserRound size={28} strokeWidth={1.8} />
                </div>
              )}
              <div>
                <div className="shared-checkin-player-name">{playerName}</div>
                <div className="shared-checkin-player-action">
                  {isLive ? 'is playing at' : 'played at'}
                </div>
              </div>
            </div>

            <div className="shared-checkin-court">
              <MapPin size={18} strokeWidth={2.3} />
              <div>
                <strong>{data.court_name || 'A LiveHoops court'}</strong>
                {!isLive && playedDate && <span>{playedDate}</span>}
              </div>
            </div>
          </>
        ) : (
          <div className="shared-checkin-state">
            <div className="shared-checkin-state-icon">🏀</div>
            <h2>This invite is no longer available</h2>
            <p>The run may have expired, been unshared, or had its privacy settings changed.</p>
          </div>
        )}
      </section>

      <div className="shared-checkin-cta">
        <h2>{signedIn ? 'Taking you to the court' : isLive ? 'Find the run' : 'Find live courts near you'}</h2>
        <p>
          {signedIn
            ? 'The map will open as soon as the invite is ready.'
            : 'Create a free LiveHoops account to see active courts and connect with local players.'}
        </p>
        <button className="auth-submit-btn" onClick={onJoin}>
          {signedIn ? 'Go to LiveHoops' : 'Join LiveHoops'}
        </button>
        {!signedIn && (
          <button className="auth-link" onClick={onLogin}>Already have an account? Log in</button>
        )}
      </div>
    </main>
  );
}
