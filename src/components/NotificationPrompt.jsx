// src/components/NotificationPrompt.jsx
//
// A dismissible banner shown near the top of the Home feed that nudges the
// user to turn on push notifications. It only appears when:
//   - the browser hasn't been asked yet (Notification.permission === 'default')
//   - the user hasn't dismissed it before (localStorage flag)
//
// Tapping "Enable" calls onEnable (the hook's enablePush) — that shows the
// browser permission popup, registers this device's token in Supabase so
// pushes can actually reach it, and remembers the choice.

import { useState } from 'react';
import { Bell, X } from 'lucide-react';

const DISMISS_KEY = 'lh_notif_prompt_dismissed';

export default function NotificationPrompt({ permission, onEnable }) {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === 'true'
  );
  const [working, setWorking] = useState(false);

  // Only prompt when permission hasn't been decided yet and it's not dismissed.
  // If the browser already granted or denied, there's nothing useful to show:
  // granted needs no prompt, and denied can't be re-prompted from a webpage.
  if (dismissed || permission !== 'default') return null;

  const handleEnable = async () => {
    setWorking(true);
    await onEnable?.();
    setWorking(false);
    // Whatever the user chose in the browser popup, we're done prompting.
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, 'true');
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, 'true');
  };

  return (
    <div className="notif-prompt">
      <div className="notif-prompt-icon">
        <Bell size={18} strokeWidth={2.5} />
      </div>
      <div className="notif-prompt-text">
        <div className="notif-prompt-title">Turn on notifications</div>
        <div className="notif-prompt-body">
          Get pinged for DMs and friend requests.
        </div>
      </div>
      <button
        className="notif-prompt-enable"
        onClick={handleEnable}
        disabled={working}
      >
        {working ? '…' : 'Enable'}
      </button>
      <button
        className="notif-prompt-dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss"
      >
        <X size={16} strokeWidth={2.5} />
      </button>
    </div>
  );
}
