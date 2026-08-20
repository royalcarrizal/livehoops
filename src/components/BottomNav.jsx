import { Home, Map, Plus, Check, Users, User } from 'lucide-react';

export default function BottomNav({ activeTab, setActiveTab, checkedIn, unreadDMs = 0 }) {
  const tabs = [
    { id: 'home', label: 'Home', Icon: Home },
    { id: 'map', label: 'Map', Icon: Map },
    { id: 'checkin', label: 'Check', Icon: Plus, special: true },
    { id: 'friends', label: 'Friends', Icon: Users },
    { id: 'profile', label: 'Profile', Icon: User },
  ];

  return (
    <nav className="bottom-nav">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        if (tab.special) {
          // The centre tab is the only filled surface in the nav, and the one
          // thing that changes colour with session state: accent when idle,
          // green with a check mark while a session is running.
          const CentreIcon = checkedIn ? Check : tab.Icon;
          return (
            <button
              key={tab.id}
              className={`nav-tab checkin-tab ${checkedIn ? 'has-checkin' : ''} ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <div className="nav-icon">
                <CentreIcon size={22} strokeWidth={checkedIn ? 3 : 2.8} />
              </div>
              <span className="nav-label">
                {checkedIn ? 'Active' : tab.label}
              </span>
            </button>
          );
        }
        return (
          <button
            key={tab.id}
            className={`nav-tab ${isActive ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <div className="nav-icon">
              <tab.Icon size={23} strokeWidth={isActive ? 2.5 : 2} />
              {tab.id === 'friends' && unreadDMs > 0 && (
                <span className="nav-unread-dot" />
              )}
            </div>
            <span className="nav-label">{tab.label}</span>
            {/* Always rendered, transparent when inactive, so switching tabs
                can't shift the row's height. */}
            <span className="nav-active-dot" />
          </button>
        );
      })}
    </nav>
  );
}
