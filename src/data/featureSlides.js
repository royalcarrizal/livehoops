// src/data/featureSlides.js
//
// The 6 slides of the "How LiveHoops Works" feature tour. Rendered by
// FeatureSlide (src/components/FeatureTour.jsx) in two places:
//   • the first-sign-up onboarding strip (Onboarding.jsx)
//   • the standalone tour opened from Settings → "How LiveHoops Works"
//
// Each: big emoji, heading, one-line subtext, and 2–3 highlight cards.
// Achievement names come from the real badge system (src/data/achievements.js).
export const FEATURE_SLIDES = [
  {
    key: 'tour_courts',
    icon: '🗺️',
    heading: 'Find live courts',
    sub: 'The map shows every court around you — and which ones have a game going right now.',
    points: [
      { icon: '🟢', text: 'Live player counts on every court, updated in real time' },
      { icon: '🙂', text: "See who's playing — player avatars right on the marker" },
      { icon: '♥', text: 'Search any court and favorite the ones you love' },
    ],
  },
  {
    key: 'tour_checkin',
    icon: '🏀',
    heading: 'Check in when you play',
    sub: "Pull up to a court and tap Check In — that's how courts go live.",
    points: [
      { icon: '📍', text: 'Your crew sees which court you\'re at' },
      { icon: '⏱️', text: 'Every session logs your check-ins, courts, and hours' },
      { icon: '🚪', text: 'Check out when you leave, or we auto-close it after 3 hours' },
    ],
  },
  {
    key: 'tour_runs',
    icon: '📅',
    heading: 'Schedule runs',
    sub: "Planning beats luck. Set a run at any court and let players know it's on.",
    points: [
      { icon: '🌍', text: 'Make it public, or keep it friends-only' },
      { icon: '🎭', text: 'RSVP with your name — or roll in anonymously as "Baller"' },
      { icon: '🔔', text: 'Everyone who\'s in gets a reminder before tip-off' },
    ],
  },
  {
    key: 'tour_achievements',
    icon: '🏆',
    heading: 'Earn achievements',
    sub: 'Badges unlock as you put in work — three tracks, twelve badges.',
    points: [
      { icon: '🏀', text: 'Check-ins: from "First Ten" to the "Hundred Club" and beyond' },
      { icon: '🗺️', text: 'Courts visited: become a "City Explorer", then a "Court Collector"' },
      { icon: '⚡', text: 'Hours on court: grind your way to "Iron Man" and "Court Legend"' },
    ],
  },
  {
    key: 'tour_crew',
    icon: '👥',
    heading: 'Build your crew',
    sub: 'Hoops is better with your people. Find them, follow them, talk trash.',
    points: [
      { icon: '🤝', text: 'Add friends and see when they\'re on the court' },
      { icon: '📸', text: 'Post updates and photos — like, comment, repost' },
      { icon: '💬', text: 'DM privately to line up your next run' },
    ],
  },
  {
    key: 'tour_control',
    icon: '🔒',
    heading: "You're in control",
    sub: 'Share exactly as much as you want — everything has a switch.',
    points: [
      { icon: '🔔', text: 'Pick which alerts you get: requests, live courts, runs' },
      { icon: '🙈', text: 'Hide your location so no one sees which court you\'re at' },
      { icon: '👁️', text: 'Set your profile to public, friends-only, or private' },
    ],
  },
];
