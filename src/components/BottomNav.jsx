import { Home, Map, Plus, Users, User } from 'lucide-react';

export default function BottomNav({ activeTab, setActiveTab, checkedIn, unreadDMs = 0 }) {
  const tabs = [
    { id: 'home', label: 'Home', Icon: Home },
    { id: 'map', label: 'Map', Icon: Map },
    { id: 'checkin', label: 'Check In', Icon: Plus, special: true },
    { id: 'friends', label: 'Friends', Icon: Users },
    { id: 'profile', label: 'Profile', Icon: User },
  ];

  return (
    <nav className="bottom-nav">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        if (tab.special) {
          return (
            <button
              key={tab.id}
              className={`nav-tab checkin-tab ${checkedIn ? 'has-checkin' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <div className="nav-icon">
                <tab.Icon size={20} strokeWidth={2.5} />
              </div>
              <span className="nav-label" style={{ color: checkedIn ? 'var(--green)' : 'var(--text-secondary)' }}>
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
              <tab.Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              {isActive && <span className="nav-active-dot" />}
              {tab.id === 'friends' && unreadDMs > 0 && (
                <span className="nav-unread-dot" />
              )}
            </div>
            <span className="nav-label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
