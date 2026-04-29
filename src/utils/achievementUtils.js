import { BADGE_DEFINITIONS } from '../data/achievements';

export function computeBadgeState(badge, userStats) {
  const current = userStats[badge.metric] ?? 0;
  const earned = current >= badge.threshold;
  const progress = Math.min(current / badge.threshold, 1);
  return { earned, progress };
}

export function getNextMilestone(metric, userStats) {
  const badges = BADGE_DEFINITIONS.filter(b => b.metric === metric);
  const next = badges.find(b => !computeBadgeState(b, userStats).earned);
  if (!next) return null;
  const current = userStats[metric] ?? 0;
  return { badge: next, current, remaining: next.threshold - current };
}
