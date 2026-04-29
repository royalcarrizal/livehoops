import { BADGE_CATEGORIES, BADGE_DEFINITIONS } from '../data/achievements';
import { computeBadgeState, getNextMilestone } from '../utils/achievementUtils';

export default function AchievementsSection({ userStats }) {
  const totalEarned = BADGE_DEFINITIONS.filter(
    b => computeBadgeState(b, userStats).earned
  ).length;

  return (
    <>
      <div className="section-header">
        <span className="section-title">Achievements</span>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
          {totalEarned} / 12
        </span>
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
              <span className="achievements-category-count">{earnedCount} / 4</span>
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
