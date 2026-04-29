export const BADGE_CATEGORIES = [
  { key: 'checkinCount',  label: 'Check-Ins',     icon: '🏀' },
  { key: 'courtsVisited', label: 'Courts Visited', icon: '📍' },
  { key: 'hoursOnCourt',  label: 'Hours on Court', icon: '⏱️' },
];

export const BADGE_DEFINITIONS = [
  // Check-Ins
  { id: 'checkin_10',  metric: 'checkinCount',  threshold: 10,  label: 'First Ten',       emoji: '🏀' },
  { id: 'checkin_50',  metric: 'checkinCount',  threshold: 50,  label: 'Court Regular',   emoji: '🔥' },
  { id: 'checkin_100', metric: 'checkinCount',  threshold: 100, label: 'Hundred Club',    emoji: '💯' },
  { id: 'checkin_500', metric: 'checkinCount',  threshold: 500, label: 'Court Legend',    emoji: '👑' },
  // Courts Visited
  { id: 'courts_10',  metric: 'courtsVisited', threshold: 10,  label: 'City Explorer',   emoji: '🗺️' },
  { id: 'courts_50',  metric: 'courtsVisited', threshold: 50,  label: 'Borough Hopper',  emoji: '🚇' },
  { id: 'courts_100', metric: 'courtsVisited', threshold: 100, label: 'Court Collector', emoji: '📍' },
  { id: 'courts_500', metric: 'courtsVisited', threshold: 500, label: 'Street Atlas',    emoji: '🌆' },
  // Hours on Court
  { id: 'hours_10',  metric: 'hoursOnCourt', threshold: 10,  label: 'Getting Buckets',  emoji: '⏱️' },
  { id: 'hours_50',  metric: 'hoursOnCourt', threshold: 50,  label: 'Put In Work',      emoji: '💪' },
  { id: 'hours_100', metric: 'hoursOnCourt', threshold: 100, label: 'Iron Man',         emoji: '⚡' },
  { id: 'hours_500', metric: 'hoursOnCourt', threshold: 500, label: 'Full-Time Baller', emoji: '🏆' },
];
