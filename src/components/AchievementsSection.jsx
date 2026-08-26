import { BADGE_CATEGORIES, BADGE_DEFINITIONS } from '../data/achievements';
import { computeBadgeState, getNextMilestone } from '../utils/achievementUtils';

// The progress ring's geometry. r=35 inside an 82px box, matching the canvas;
// the dash array has to be the true circumference or the arc under-fills.
const RING_RADIUS = 35;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export default function AchievementsSection({ userStats }) {
  const totalEarned = BADGE_DEFINITIONS.filter(
    b => computeBadgeState(b, userStats).earned
  ).length;

  // Derived, not written down. These were the literals "12" and "4", which are
  // right until somebody adds a badge and then quietly are not.
  const totalBadges = BADGE_DEFINITIONS.length;
  const progress = totalBadges > 0 ? totalEarned / totalBadges : 0;

  return (
    <>
      {/* Summary. The sheet's own header already says "Achievements", so this
          block carries the count instead of repeating the title. The ring
          replaces a plain "N / 12" — same information, but a shape you can
          read at a glance rather than parse. */}
      <div className="achievements-summary">
        <div className="achievements-ring">
          <svg viewBox="0 0 82 82" aria-hidden="true" focusable="false">
            <circle className="achievements-ring__track" cx="41" cy="41" r={RING_RADIUS} />
            <circle
              className="achievements-ring__fill"
              cx="41" cy="41" r={RING_RADIUS}
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
            />
          </svg>
          {/* Real text, not part of the aria-hidden SVG — the count is the
              information here; the ring is only how it is drawn. */}
          <div className="achievements-ring__label">
            <span className="achievements-ring__count">{totalEarned}</span>
            <span className="achievements-ring__total">of {totalBadges}</span>
          </div>
        </div>
        <p className="achievements-summary-text">
          Badges unlock from check-ins, courts visited and hours on court.
        </p>
      </div>

      {BADGE_CATEGORIES.map(category => {
        const badges = BADGE_DEFINITIONS.filter(b => b.metric === category.key);
        const nextMilestone = getNextMilestone(category.key, userStats);
        const earnedCount = badges.filter(b => computeBadgeState(b, userStats).earned).length;

        return (
          <div key={category.key} className="achievements-category">
            <div className="achievements-category-header">
              <span className="achievements-category-label">
                {category.icon} {category.label}
              </span>
              <span className="achievements-category-count">{earnedCount} / {badges.length}</span>
            </div>

            <div className="badge-grid">
              {badges.map(badge => {
                const { earned, progress } = computeBadgeState(badge, userStats);
                const isNextTarget = nextMilestone?.badge.id === badge.id;

                return (
                  <div key={badge.id} className={`badge-tile ${earned ? 'earned' : 'locked'}`}>
                    <span className="badge-emoji">{badge.emoji}</span>
                    <span className="badge-label">{badge.label}</span>

                    {!earned && isNextTarget && (
                      <div className="badge-progress-wrap">
                        <div className="badge-progress-track">
                          <div
                            className="badge-progress-fill"
                            style={{ width: `${progress * 100}%` }}
                          />
                        </div>
                        <div className="badge-progress-text">
                          {userStats[badge.metric]} / {badge.threshold}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
