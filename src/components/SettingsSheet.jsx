// src/components/SettingsSheet.jsx
//
// A full-height slide-up settings sheet that appears when the user taps the
// gear icon on their profile. It contains 6 sections:
//   1. Account    — Edit Profile, Change Password, Change Email
//   2. Notifications — Push, Friend requests, Court goes live
//   3. Appearance — Dark mode toggle
//   4. Privacy    — Profile visibility, Show my location
//   5. Support    — Privacy policy, Terms, Feedback, Rate app
//   6. Danger     — Sign out, Delete account
//
// It uses the same slide-up animation pattern as the Achievements and
// Edit Profile sheets (transform: translateY transition, always in DOM).
//
// Props:
//   isOpen        — true = sheet is visible
//   onClose       — called when the user closes the sheet
//   user          — Supabase user object (has .email and .id)
//   signOut       — async function that logs the user out (from useAuth)
//   onEditProfile — callback to open the Edit Profile sheet in ProfileScreen

import { useState, useEffect } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../hooks/useToast';
import { useNotifications } from '../hooks/useNotifications';
import { sendPush } from '../lib/push';
import { firebaseConfigured } from '../firebase';
import Toast from './Toast';
import LegalSheet from './LegalSheet';
import FeatureTour from './FeatureTour';
import AdminSheet from './AdminSheet';
import BlockedAccountsSheet from './BlockedAccountsSheet';

// ── Environment detection (for the notification diagnostics) ────────────────
// Mirrors the standalone check in Onboarding.jsx: navigator.standalone is the
// iOS-specific signal, display-mode covers the standard PWA case. iOS only
// delivers web push when the app is launched from its Home-Screen icon, so
// "on iOS but NOT installed" is a common reason the phone stays silent.
function isIOSDevice() {
  const ua = navigator.userAgent || '';
  // iPadOS 13+ reports as Mac but has touch — catch it via maxTouchPoints.
  return /iphone|ipad|ipod/i.test(ua) ||
    (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

function isStandalonePWA() {
  return navigator.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true;
}

// ── Toggle sub-component ────────────────────────────────────────────────────
// A simple on/off pill toggle. Styled in index.css as .settings-toggle.
// The .on class slides the dot to the right and turns the pill orange.
function Toggle({ on, onToggle }) {
  return (
    <button
      className={`settings-toggle${on ? ' on' : ''}`}
      onClick={onToggle}
      // aria-pressed tells screen readers whether this toggle is on or off
      aria-pressed={on}
      type="button"
    >
      <div className="settings-toggle-dot" />
    </button>
  );
}

// ── Diagnostics line ────────────────────────────────────────────────────────
// One label/value row inside the notification Diagnostics block. Colors inherit
// from the sheet (theme-safe): the label is muted via opacity, the value turns
// red only when `ok` is explicitly false so a broken hop stands out.
function DiagLine({ label, value, ok }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span
        style={{
          textAlign: 'right',
          fontWeight: 500,
          color: ok === false ? '#FF453A' : 'inherit',
        }}
      >
        {value}
      </span>
    </div>
  );
}

export default function SettingsSheet({ isOpen, onClose, user, signOut, onEditProfile, profile, updateProfile, blockedUsers = [], unblockUser }) {

  // ── Master push toggle (per-device) ─────────────────────────────────────
  // The hook is the single source of truth: enablePush asks the browser +
  // registers this device's token; disablePush actually removes it (so pushes
  // stop) and reports success. pushEnabled reflects that persisted state.
  const { permission, pushEnabled, deviceToken, enablePush, disablePush } = useNotifications(user?.id);

  // ── Category toggles (account-level) ────────────────────────────────────
  // Friend Request / Court Goes Live / Run alerts are REAL settings stored on
  // the profile row (supabase/notification_preferences.sql), not localStorage:
  // they gate whether OTHER users' actions push to this user, so they must be
  // readable by whoever triggers the notification. Independent of the
  // per-device master toggle above — they still apply to the user's other
  // devices even when this one is turned off.
  const notifFriends = profile?.notif_friend_requests ?? true;
  const notifCourts  = profile?.notif_court_checkins  ?? false;
  const notifMeetups = profile?.notif_meetups         ?? true;

  // ── Privacy settings ────────────────────────────────────────────────────
  // These are REAL settings stored on the user's profile row in Supabase
  // (see supabase/privacy_settings.sql), not just local preferences:
  //   show_location       — off = friends can't see which court you're at,
  //                         and check-ins stop saving your GPS coordinates
  //   profile_visibility  — 'public' | 'friends' | 'private'
  // We read the current values from the profile prop and save changes with
  // updateProfile. Defaults match the database defaults (on / public).
  const showLocation = profile?.show_location ?? true;
  const profileVis   = profile?.profile_visibility ?? 'public';

  // Human-readable labels for the visibility values stored in the database
  const VISIBILITY_LABELS = {
    public:  'Public',
    friends: 'Friends only',
    private: 'Private',
  };

  // True while a privacy setting save is in flight (prevents double-taps)
  const [privacySaving, setPrivacySaving] = useState(false);

  // ── Change Email form ───────────────────────────────────────────────────
  // showEmailForm controls whether the inline email input expands below the row
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [newEmail, setNewEmail]           = useState('');
  const [emailSaving, setEmailSaving]     = useState(false);

  // ── Legal sheet ─────────────────────────────────────────────────────────
  // 'privacy' | 'terms' | null — opens the in-app legal document viewer
  const [legalType, setLegalType] = useState(null);

  // ── Feature tour ────────────────────────────────────────────────────────
  // "How LiveHoops Works" — reopens the same 6-slide tour new users see
  // during onboarding (shared slide content in FeatureTour.jsx).
  const [showTour, setShowTour] = useState(false);

  // ── Blocked accounts list ────────────────────────────────────────────────
  const [showBlocked, setShowBlocked] = useState(false);

  // ── Admin moderation (only for profiles with is_admin) ──────────────────
  // pendingCounts drives the badge: { courts: n, reports: n } from the
  // admin_pending_counts RPC — the "alert when something's waiting".
  const [showAdmin, setShowAdmin]         = useState(false);
  const [pendingCounts, setPendingCounts] = useState(null);
  const isAdmin = !!profile?.is_admin;

  useEffect(() => {
    if (!isOpen || !isAdmin) return;
    supabase.rpc('admin_pending_counts').then(({ data, error }) => {
      if (!error && data) setPendingCounts(data);
    });
  }, [isOpen, isAdmin, showAdmin]); // refetch after the admin sheet closes

  const pendingTotal = (pendingCounts?.courts ?? 0) + (pendingCounts?.reports ?? 0);

  // ── Confirmation dialogs ────────────────────────────────────────────────
  // 'signout' | 'delete' | null — controls which dialog is visible
  const [confirm, setConfirm] = useState(null);

  // True while a delete account request is in progress
  const [deleting, setDeleting] = useState(false);

  // ── Theme and toast ─────────────────────────────────────────────────────
  // useTheme drives the dark/light mode toggle for the whole app
  const { isDark, toggleTheme } = useTheme();

  // SettingsSheet has its own toast so messages show on top of the overlay
  const { toast, showToast } = useToast();

  // ── Handler: Push notification toggle ──────────────────────────────────
  // Both directions do real work via the hook — no local flag to drift.
  // Turning ON asks the browser + registers the token; turning OFF removes it
  // and only reflects "off" if that succeeded, so the toggle can't show off
  // while pushes keep arriving.
  const handleNotifToggle = async () => {
    if (!pushEnabled) {
      const result = await enablePush();
      if (result !== 'granted') {
        showToast('Notifications blocked — check your browser settings');
      }
    } else {
      const ok = await disablePush();
      if (ok) {
        showToast('Notifications turned off on this device');
      } else {
        showToast("Couldn't turn off on this device — try again");
      }
    }
  };

  // ── Send a test notification to yourself ────────────────────────────────
  // Only useful once permission is granted and this device has registered.
  // Fires a push to the current user's own devices via the send-push
  // Edge Function — handy for confirming the whole pipeline end to end.
  const [testing, setTesting] = useState(false);
  // Whether the collapsible Diagnostics block is expanded, and the plain-
  // language outcome of the most recent test send (null until one runs).
  const [diagOpen, setDiagOpen] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const handleTestPush = async () => {
    if (testing || !user?.id) return;
    setTesting(true);
    setTestResult('Sending…');
    // Await the real result so we can tell "delivered to a device" apart from
    // "sent to nobody" (sent: 0) or an outright failure — the whole point of
    // the diagnostics. The panel auto-opens so the outcome is visible.
    const { data, error } = await sendPush(
      user.id, 'LiveHoops 🏀', 'Your notifications are working!', { kind: 'test' }
    );
    if (error) {
      setTestResult(`❌ Failed: ${error.message}`);
      showToast('Test failed — see Diagnostics');
    } else if ((data?.sent ?? 0) >= 1) {
      setTestResult(`✅ Delivered to ${data.sent} device${data.sent === 1 ? '' : 's'}`);
      showToast('Test delivered — watch for the banner');
    } else {
      const reason = data?.reason ? ` (${data.reason})` : '';
      setTestResult(`⚠️ This device isn't registered — no banner will show${reason}`);
      showToast('No registered device — see Diagnostics');
    }
    setDiagOpen(true);
    setTesting(false);
  };

  // ── Handler: Friend request alerts toggle ───────────────────────────────
  // Saved to the profiles table — this is what other users' sendFriendRequest
  // / acceptFriendRequest calls check before pushing to you.
  const handleFriendsToggle = async () => {
    if (privacySaving) return;
    setPrivacySaving(true);
    const { error } = await updateProfile({ notif_friend_requests: !notifFriends });
    setPrivacySaving(false);
    if (error) showToast('❌ Failed to save — try again');
  };

  // ── Handler: Court goes live toggle ────────────────────────────────────
  // Saved to the profiles table — checked by notifyFriendsOfCheckIn
  // (useCheckIn.js) when any of your friends checks in.
  const handleCourtsToggle = async () => {
    if (privacySaving) return;
    setPrivacySaving(true);
    const { error } = await updateProfile({ notif_court_checkins: !notifCourts });
    setPrivacySaving(false);
    if (error) showToast('❌ Failed to save — try again');
  };

  // ── Handler: Run alerts toggle ─────────────────────────────────────────
  // Saved to the profiles table — checked by notifyFriendsOfMeetup
  // (useMeetups.js) when a friend schedules a run.
  const handleMeetupsToggle = async () => {
    if (privacySaving) return;
    setPrivacySaving(true);
    const { error } = await updateProfile({ notif_meetups: !notifMeetups });
    setPrivacySaving(false);
    if (error) showToast('❌ Failed to save — try again');
  };

  // ── Handler: Show my location toggle ───────────────────────────────────
  // Saves to the profiles table. When off: the get_friends_active_checkins
  // RPC hides your check-in from friends, get_court_active_players hides
  // you from the map and court sheets, no check-in pushes go out, and
  // App.jsx stops saving GPS coords on check-in.
  const handleLocationToggle = async () => {
    if (privacySaving) return;
    setPrivacySaving(true);
    const next = !showLocation;
    const { error } = await updateProfile({ show_location: next });
    setPrivacySaving(false);
    if (error) {
      showToast('❌ Failed to save — try again');
    } else {
      showToast(next
        ? 'You\'ll appear on the map when checked in'
        : 'You\'re now hidden on the map and from friends');
    }
  };

  // ── Handler: Profile visibility cycle ──────────────────────────────────
  // Each tap cycles: public → friends → private → public → …
  // Saved to the profiles table; enforced in search (private users are
  // hidden), the Nearby feed, and on the profile page itself.
  const cycleVisibility = async () => {
    if (privacySaving) return;
    setPrivacySaving(true);
    const options = ['public', 'friends', 'private'];
    const next = options[(options.indexOf(profileVis) + 1) % options.length];
    const { error } = await updateProfile({ profile_visibility: next });
    setPrivacySaving(false);
    if (error) showToast('❌ Failed to save — try again');
  };

  // ── Handler: Change password ────────────────────────────────────────────
  // Sends a password reset email via Supabase. The link brings the user back
  // to the app root, where the PASSWORD_RECOVERY event (handled in useAuth)
  // shows the Set New Password screen.
  const handleChangePassword = async () => {
    try {
      await supabase.auth.resetPasswordForEmail(user?.email, {
        redirectTo: window.location.origin,
      });
      showToast('Password reset email sent to ' + user?.email);
    } catch {
      showToast('❌ Failed to send reset email');
    }
  };

  // ── Handler: Save new email ─────────────────────────────────────────────
  // Calls Supabase to update the email. Supabase will send a confirmation
  // email to the new address — the change is not immediate.
  const handleSaveEmail = async () => {
    if (!newEmail.trim()) return;
    setEmailSaving(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setEmailSaving(false);
    if (error) {
      showToast('❌ ' + error.message);
    } else {
      showToast('Confirmation sent to ' + newEmail.trim());
      setShowEmailForm(false);
      setNewEmail('');
    }
  };

  // ── Handler: Sign out (confirmed) ──────────────────────────────────────
  // Close the sheet first, then sign out so the UI transition looks clean
  const handleSignOut = async () => {
    setConfirm(null);
    onClose();
    await signOut();
  };

  // ── Handler: Delete account (confirmed) ────────────────────────────────
  // Tries to call a Supabase database function named 'delete_user'.
  // If that function doesn't exist yet, the error is caught and we show
  // instructions to contact support instead — no crash.
  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.rpc('delete_user');
      if (error) throw error;
      setConfirm(null);
      await signOut();
    } catch {
      setDeleting(false);
      setConfirm(null);
      showToast('Something went wrong. Please try again.');
    }
  };

  return (
    <>
      {/* ── Dark overlay ─────────────────────────────────────────────────── */}
      {/* Always in the DOM. Fades in (opacity 0→1) when .open is added.    */}
      {/* Tapping it closes the sheet.                                        */}
      <div
        className={`settings-overlay${isOpen ? ' open' : ''}`}
        onClick={onClose}
      />

      {/* ── Settings sheet ───────────────────────────────────────────────── */}
      {/* Always in the DOM. Slides up from below the screen when .open.     */}
      <div className={`settings-sheet${isOpen ? ' open' : ''}`}>

        {/* Small gray pill at the top — visual drag handle affordance */}
        <div className="settings-drag-handle" />

        {/* Header row: "Settings" title + X close button */}
        <div className="settings-header">
          <span className="settings-header-title">Settings</span>
          <button
            className="settings-close-btn"
            onClick={onClose}
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────────────── */}
        <div className="settings-body">

          {/* ── Section 1: Account ─────────────────────────────────────────── */}
          <div>
            <div className="settings-section-label">Account</div>
            <div className="settings-group">

              {/* Edit Profile — closes this sheet and opens the Edit Profile sheet */}
              <button
                className="settings-row"
                onClick={() => { onClose(); onEditProfile(); }}
              >
                <div className="settings-row-icon" style={{ background: '#2C6FED' }}>👤</div>
                <div className="settings-row-content">
                  <div className="settings-row-title">Edit Profile</div>
                </div>
                <div className="settings-row-right">
                  <ChevronRight size={16} />
                </div>
              </button>

              {/* Change Password — sends a reset email, no new screen */}
              <button className="settings-row" onClick={handleChangePassword}>
                <div className="settings-row-icon" style={{ background: '#5856D6' }}>🔒</div>
                <div className="settings-row-content">
                  <div className="settings-row-title">Change Password</div>
                  <div className="settings-row-desc">Sends a reset link to your email</div>
                </div>
                <div className="settings-row-right">
                  <ChevronRight size={16} />
                </div>
              </button>

              {/* Change Email — tapping expands an inline email input below */}
              <div>
                <button
                  className="settings-row"
                  onClick={() => setShowEmailForm(v => !v)}
                >
                  <div className="settings-row-icon" style={{ background: '#32ADE6' }}>✉️</div>
                  <div className="settings-row-content">
                    <div className="settings-row-title">Change Email</div>
                    {/* Show their current email as a hint */}
                    <div className="settings-row-desc">{user?.email}</div>
                  </div>
                  <div className="settings-row-right">
                    <ChevronRight size={16} />
                  </div>
                </button>

                {/* Inline email form — only visible when showEmailForm is true */}
                {showEmailForm && (
                  <div style={{ padding: '0 16px 14px', display: 'flex', gap: 8 }}>
                    <input
                      type="email"
                      placeholder="New email address"
                      value={newEmail}
                      onChange={e => setNewEmail(e.target.value)}
                      className="settings-email-input"
                    />
                    <button
                      className="settings-email-save-btn"
                      onClick={handleSaveEmail}
                      disabled={emailSaving}
                    >
                      {emailSaving ? '…' : 'Save'}
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* ── Section 2: Notifications ────────────────────────────────────── */}
          <div>
            <div className="settings-section-label">Notifications</div>
            <div className="settings-group">

              {/* Push notifications — per-device master switch. On registers
                  this device's token; off actually removes it (see the hook).
                  Shows "on" only when granted AND enabled on this device. */}
              <div className="settings-row">
                <div className="settings-row-icon" style={{ background: '#FF9500' }}>🔔</div>
                <div className="settings-row-content">
                  <div className="settings-row-title">Push Notifications</div>
                  <div className="settings-row-desc">
                    {permission === 'denied'
                      ? 'Blocked in your browser settings'
                      : 'Receive pushes on this device'}
                  </div>
                </div>
                <Toggle
                  on={pushEnabled && permission === 'granted'}
                  onToggle={handleNotifToggle}
                />
              </div>

              {/* Send test notification — only when push is actually on for this
                  device (granted AND enabled), so it isn't offered with no token. */}
              {pushEnabled && permission === 'granted' && (
                <button className="settings-row" onClick={handleTestPush} disabled={testing}>
                  <div className="settings-row-icon" style={{ background: '#0A84FF' }}>🧪</div>
                  <div className="settings-row-content">
                    <div className="settings-row-title">Send Test Notification</div>
                    <div className="settings-row-desc">Push a test alert to this device</div>
                  </div>
                  <div className="settings-row-right"><ChevronRight size={16} /></div>
                </button>
              )}

              {/* Diagnostics — collapsed by default. Reveals exactly where the
                  push chain breaks: OS permission, whether Firebase is
                  configured in THIS build (catches env vars missing in the
                  deployed/Vercel build), whether this device registered a
                  token, and the real result of the last test send. Always
                  available (even with push off) since that's when it's needed. */}
              <button
                className="settings-row"
                onClick={() => setDiagOpen((o) => !o)}
                aria-expanded={diagOpen}
                type="button"
              >
                <div className="settings-row-icon" style={{ background: '#8E8E93' }}>🩺</div>
                <div className="settings-row-content">
                  <div className="settings-row-title">Diagnostics</div>
                  <div className="settings-row-desc">Why notifications may not reach this phone</div>
                </div>
                <div className="settings-row-right">
                  <ChevronRight
                    size={16}
                    style={{
                      transform: diagOpen ? 'rotate(90deg)' : 'none',
                      transition: 'transform 0.15s ease',
                    }}
                  />
                </div>
              </button>

              {diagOpen && (
                <div className="settings-row" style={{ display: 'block' }}>
                  <div style={{ width: '100%', fontSize: '0.85rem', lineHeight: 1.5 }}>
                    <DiagLine label="OS permission" value={permission} />
                    <DiagLine
                      label="Firebase configured in this build"
                      value={firebaseConfigured ? 'Yes' : 'No — push cannot register'}
                      ok={firebaseConfigured}
                    />
                    <DiagLine
                      label="This device registered"
                      value={deviceToken ? `Yes (${deviceToken.slice(0, 8)}…)` : 'No — no banners will arrive'}
                      ok={!!deviceToken}
                    />
                    <DiagLine
                      label="Last test send"
                      value={testResult ?? 'Not tested yet'}
                    />
                    {isIOSDevice() && !isStandalonePWA() && (
                      <div style={{ marginTop: 8, opacity: 0.8 }}>
                        ⚠️ On iPhone, web push only works when LiveHoops is opened from its
                        Home-Screen icon. In Safari, tap Share → “Add to Home Screen,” then
                        open it from there and enable notifications.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Friend request alerts — notified when someone sends a friend request */}
              <div className="settings-row">
                <div className="settings-row-icon" style={{ background: '#30D158' }}>👥</div>
                <div className="settings-row-content">
                  <div className="settings-row-title">Friend Request Alerts</div>
                </div>
                <Toggle on={notifFriends} onToggle={handleFriendsToggle} />
              </div>

              {/* Court goes live — notified when activity is detected at a saved court */}
              <div className="settings-row">
                <div className="settings-row-icon" style={{ background: '#FF6B00' }}>🏀</div>
                <div className="settings-row-content">
                  <div className="settings-row-title">Court Goes Live Alerts</div>
                </div>
                <Toggle on={notifCourts} onToggle={handleCourtsToggle} />
              </div>

              {/* Run alerts — notified when a friend schedules a meetup at a court */}
              <div className="settings-row">
                <div className="settings-row-icon" style={{ background: '#5856D6' }}>📅</div>
                <div className="settings-row-content">
                  <div className="settings-row-title">Run Alerts</div>
                  <div className="settings-row-desc">When a friend schedules a run</div>
                </div>
                <Toggle on={notifMeetups} onToggle={handleMeetupsToggle} />
              </div>

            </div>
          </div>

          {/* ── Section 3: Appearance ───────────────────────────────────────── */}
          <div>
            <div className="settings-section-label">Appearance</div>
            <div className="settings-group">

              {/* Dark Mode — toggles the entire app theme instantly */}
              <div className="settings-row">
                <div className="settings-row-icon" style={{ background: '#1C1C1E' }}>🌙</div>
                <div className="settings-row-content">
                  <div className="settings-row-title">Dark Mode</div>
                </div>
                <Toggle on={isDark} onToggle={toggleTheme} />
              </div>

            </div>
          </div>

          {/* ── Section 4: Privacy ──────────────────────────────────────────── */}
          <div>
            <div className="settings-section-label">Privacy</div>
            <div className="settings-group">

              {/* Profile visibility — tapping cycles through Public / Friends only / Private */}
              <button className="settings-row" onClick={cycleVisibility}>
                <div className="settings-row-icon" style={{ background: '#5856D6' }}>👁</div>
                <div className="settings-row-content">
                  <div className="settings-row-title">Profile Visibility</div>
                  <div className="settings-row-desc">
                    {profileVis === 'public'  && 'Anyone can see your posts and stats'}
                    {profileVis === 'friends' && 'Only friends see your posts and stats'}
                    {profileVis === 'private' && 'Hidden from search · friends only'}
                  </div>
                </div>
                {/* Show current value in muted text + arrow */}
                <div className="settings-row-right" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>{VISIBILITY_LABELS[profileVis]}</span>
                  <ChevronRight size={16} />
                </div>
              </button>

              {/* Show my location — controls whether check-in location is visible to others */}
              <div className="settings-row">
                <div className="settings-row-icon" style={{ background: '#30D158' }}>📍</div>
                <div className="settings-row-content">
                  <div className="settings-row-title">Show My Location</div>
                  <div className="settings-row-desc">Appear on the map at courts you check into</div>
                </div>
                <Toggle on={showLocation} onToggle={handleLocationToggle} />
              </div>

              {/* Blocked accounts — opens the management list */}
              <button className="settings-row" onClick={() => setShowBlocked(true)}>
                <div className="settings-row-icon" style={{ background: '#8E8E93' }}>🚫</div>
                <div className="settings-row-content">
                  <div className="settings-row-title">Blocked Accounts</div>
                  {blockedUsers.length > 0 && (
                    <div className="settings-row-desc">
                      {blockedUsers.length} {blockedUsers.length === 1 ? 'account' : 'accounts'} blocked
                    </div>
                  )}
                </div>
                <ChevronRight size={16} />
              </button>

            </div>
          </div>

          {/* ── Admin section — only rendered for is_admin profiles ─────────── */}
          {isAdmin && (
            <div>
              <div className="settings-section-label">Admin</div>
              <div className="settings-group">
                <button className="settings-row" onClick={() => setShowAdmin(true)}>
                  <div className="settings-row-icon" style={{ background: '#AF52DE' }}>🛡️</div>
                  <div className="settings-row-content">
                    <div className="settings-row-title">Moderation</div>
                    <div className="settings-row-desc">
                      {pendingTotal > 0
                        ? `${pendingCounts?.courts ?? 0} court${(pendingCounts?.courts ?? 0) === 1 ? '' : 's'} · ${pendingCounts?.reports ?? 0} report${(pendingCounts?.reports ?? 0) === 1 ? '' : 's'} waiting`
                        : 'Court submissions & post reports'}
                    </div>
                  </div>
                  <div className="settings-row-right" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {pendingTotal > 0 && (
                      <span className="settings-admin-badge">{pendingTotal > 99 ? '99+' : pendingTotal}</span>
                    )}
                    <ChevronRight size={16} />
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* ── Section 5: Support ──────────────────────────────────────────── */}
          <div>
            <div className="settings-section-label">Support</div>
            <div className="settings-group">

              {/* How LiveHoops Works — reopens the feature tour anytime */}
              <button
                className="settings-row"
                onClick={() => setShowTour(true)}
              >
                <div className="settings-row-icon" style={{ background: '#FF6B00' }}>📖</div>
                <div className="settings-row-content">
                  <div className="settings-row-title">How LiveHoops Works</div>
                  <div className="settings-row-desc">A quick tour of the app</div>
                </div>
                <div className="settings-row-right"><ChevronRight size={16} /></div>
              </button>

              {/* Privacy Policy — opens in-app legal sheet */}
              <button
                className="settings-row"
                onClick={() => setLegalType('privacy')}
              >
                <div className="settings-row-icon" style={{ background: '#636366' }}>📄</div>
                <div className="settings-row-content">
                  <div className="settings-row-title">Privacy Policy</div>
                </div>
                <div className="settings-row-right"><ChevronRight size={16} /></div>
              </button>

              {/* Terms of Service — opens in-app legal sheet */}
              <button
                className="settings-row"
                onClick={() => setLegalType('terms')}
              >
                <div className="settings-row-icon" style={{ background: '#636366' }}>📋</div>
                <div className="settings-row-content">
                  <div className="settings-row-title">Terms of Service</div>
                </div>
                <div className="settings-row-right"><ChevronRight size={16} /></div>
              </button>

              {/* Send Feedback — opens a mailto link; replace with your real support email */}
              <button
                className="settings-row"
                onClick={() => window.open('mailto:royalanthony96@gmail.com', '_blank')}
              >
                <div className="settings-row-icon" style={{ background: '#32ADE6' }}>💬</div>
                <div className="settings-row-content">
                  <div className="settings-row-title">Send Feedback</div>
                </div>
                <div className="settings-row-right"><ChevronRight size={16} /></div>
              </button>

              {/* Rate LiveHoops — shows a toast until the app is on the App Store */}
              <button
                className="settings-row"
                onClick={() => showToast('Rating available after App Store launch 🏀')}
              >
                <div className="settings-row-icon" style={{ background: '#FF9500' }}>⭐</div>
                <div className="settings-row-content">
                  <div className="settings-row-title">Rate LiveHoops</div>
                </div>
                <div className="settings-row-right"><ChevronRight size={16} /></div>
              </button>

            </div>
          </div>

          {/* ── Section 6: Danger Zone ──────────────────────────────────────── */}
          <div>
            <div className="settings-section-label">Danger Zone</div>
            <div className="settings-group">

              {/* Sign Out — shows a confirmation dialog before logging out */}
              <button className="settings-row" onClick={() => setConfirm('signout')}>
                <div className="settings-row-icon" style={{ background: '#2C2C2E' }}>🚪</div>
                <div className="settings-row-content">
                  {/* Red title text signals this is a destructive action */}
                  <div className="settings-row-title" style={{ color: '#FF453A' }}>Sign Out</div>
                </div>
                <div className="settings-row-right"><ChevronRight size={16} /></div>
              </button>

              {/* Delete Account — shows a stronger confirmation before deleting */}
              <button className="settings-row" onClick={() => setConfirm('delete')}>
                <div className="settings-row-icon" style={{ background: '#2C2C2E' }}>🗑️</div>
                <div className="settings-row-content">
                  <div className="settings-row-title" style={{ color: '#FF453A' }}>Delete Account</div>
                  <div className="settings-row-desc">Permanently removes all your data</div>
                </div>
                <div className="settings-row-right"><ChevronRight size={16} /></div>
              </button>

            </div>
          </div>

        </div>{/* end .settings-body */}
      </div>{/* end .settings-sheet */}

      {/* ── Sign Out confirmation dialog ────────────────────────────────────── */}
      {/* Renders above everything else (z-index 400) */}
      {confirm === 'signout' && (
        <div className="settings-confirm-overlay">
          <div className="settings-confirm-box">
            <div className="settings-confirm-title">Sign Out?</div>
            <div className="settings-confirm-desc">
              Are you sure you want to sign out?
            </div>
            <div className="settings-confirm-btns">
              <button
                className="settings-confirm-cancel"
                onClick={() => setConfirm(null)}
              >
                Cancel
              </button>
              <button
                className="settings-confirm-danger"
                onClick={handleSignOut}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Account confirmation dialog ─────────────────────────────── */}
      {confirm === 'delete' && (
        <div className="settings-confirm-overlay">
          <div className="settings-confirm-box">
            <div className="settings-confirm-title">Delete Account?</div>
            <div className="settings-confirm-desc">
              This will permanently delete your account and all your data.
              This cannot be undone.
            </div>
            <div className="settings-confirm-btns">
              <button
                className="settings-confirm-cancel"
                onClick={() => setConfirm(null)}
              >
                Cancel
              </button>
              <button
                className="settings-confirm-danger"
                onClick={handleDeleteAccount}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-app legal document viewer — slides over the settings sheet */}
      <LegalSheet type={legalType} onClose={() => setLegalType(null)} />

      {/* Feature tour — full-screen overlay above the settings sheet */}
      {showTour && <FeatureTour onClose={() => setShowTour(false)} />}

      {/* Admin moderation panel — renders above the settings sheet */}
      {showAdmin && <AdminSheet onClose={() => setShowAdmin(false)} />}

      {/* Blocked accounts list — renders above the settings sheet */}
      {showBlocked && (
        <BlockedAccountsSheet
          blockedUsers={blockedUsers}
          onUnblock={unblockUser}
          onClose={() => setShowBlocked(false)}
        />
      )}

      {/* Toast notification — shown above the sheet so messages are visible */}
      <Toast message={toast} />
    </>
  );
}
