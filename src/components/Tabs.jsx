// src/components/Tabs.jsx
//
// The app's one tab control — for switching between views within a screen.
//
// It exists because there were two tab languages and they were applied by
// accident rather than by rule: Profile used an underline, while Home and
// Friends used `.segmented`, the pill control. The canvas uses an underline in
// all four places it navigates between views (Home, Friends, Profile,
// Achievements), so the underline is the one that stays.
//
// `.segmented` is NOT deprecated by this and must not be replaced everywhere.
// The two controls answer different questions:
//
//   .segmented  picks a VALUE   — Sign Up / Log In, auto check-out 1h / 2h / 3h
//   Tabs        picks a VIEW    — Following / Nearby, Friends / Messages
//
// A pill that looks like a setting is the wrong affordance for navigation, and
// that mismatch is what this consolidates.

/**
 * Tabs
 *
 * Props:
 *   tabs     {{ value, label, badge? }[]} — badge renders after the label,
 *                                            for things like an unread count
 *   value    {string}   — the currently selected tab's value
 *   onChange {function} — called with the newly selected value
 *   className {string}  — optional, for screen-specific spacing
 */
export default function Tabs({ tabs, value, onChange, className = '' }) {
  return (
    <div className={`tabs${className ? ` ${className}` : ''}`}>
      {tabs.map(tab => (
        <button
          key={tab.value}
          type="button"
          className={`tabs__tab${value === tab.value ? ' is-selected' : ''}`}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
          {tab.badge != null && <span className="tabs__badge">{tab.badge}</span>}
        </button>
      ))}
    </div>
  );
}
