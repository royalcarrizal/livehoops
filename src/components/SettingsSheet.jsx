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

import { useState } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../hooks/useToast';
import Toast from './Toast';
import LegalSheet from './LegalSheet';

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

export default function SettingsSheet({ isOpen, onClose, user, signOut, onEditProfile }) {

  // ── Notification toggles ────────────────────────────────────────────────
  // Read from localStorage so the values survive page refreshes.
  // The default for push and friends is ON (true unless explicitly 'false').
  // The default for courts is OFF (only on if explicitly 'true').
  const [notifEnabled, setNotifEnabled] = useState(
    () => localStorage.getItem('lh_notif_enabled') !== 'false'
  );
  const [notifFriends, setNotifFriends] = useState(
    () => localStorage.getItem('lh_notif_friends') !== 'false'
  );
  const [notifCourts, setNotifCourts] = useState(
    () => localStorage.getItem('lh_notif_courts') === 'true'
  );

  // ── Privacy settings ────────────────────────────────────────────────────
  // Location is ON by default. Visibility defaults to 'Public'.
  const [showLocation, setShowLocation] = useState(
    () => localStorage.getItem('lh_show_location') !== 'false'
  );
  const [profileVis, setProfileVis] = useState(
    () => localStorage.getItem('lh_profile_visibility') || 'Public'
  );

  // ── Change Email form ───────────────────────────────────────────────────
  // showEmailForm controls whether the inline email input expands below the row
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [newEmail, setNewEmail]           = useState('');
  const [emailSaving, setEmailSaving]     = useState(false);

  // ── Legal sheet ─────────────────────────────────────────────────────────
  // 'privacy' | 'terms' | null — opens the in-app legal document viewer
  const [legalType, setLegalType] = useState(null);

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
  // If turning ON: ask the browser for notification permission first.
  // If the user denies permission, we don't flip the toggle.
  const handleNotifToggle = async () => {
    const next = !notifEnabled;
    if (next) {
      const result = await Notification.requestPermission();
      if (result !== 'granted') {
        showToast('Notifications blocked — check your browser settings');
        return;
      }
    }
    setNotifEnabled(next);
    localStorage.setItem('lh_notif_enabled', String(next));
  };

  // ── Handler: Friend request alerts toggle ───────────────────────────────
  const handleFriendsToggle = () => {
    const next = !notifFriends;
    setNotifFriends(next);
    localStorage.setItem('lh_notif_friends', String(next));
  };

  // ── Handler: Court goes live toggle ────────────────────────────────────
  const handleCourtsToggle = () => {
    const next = !notifCourts;
    setNotifCourts(next);
    localStorage.setItem('lh_notif_courts', String(next));
  };

  // ── Handler: Show my location toggle ───────────────────────────────────
  const handleLocationToggle = () => {
    const next = !showLocation;
    setShowLocation(next);
    localStorage.setItem('lh_show_location', String(next));
  };

  // ── Handler: Profile visibility cycle ──────────────────────────────────
  // Each tap cycles: Public → Friends only → Private → Public → …
  const cycleVisibility = () => {
    const options = ['Public', 'Friends only', 'Private'];
    const next = options[(options.indexOf(profileVis) + 1) % options.length];
    setProfileVis(next);
    localStorage.setItem('lh_profile_visibility', next);
  };

  // ── Handler: Change password ────────────────────────────────────────────
  // Sends a password reset email via Supabase — the user clicks the link in
  // that email to set a new password. No new screen needed here.
  const handleChangePassword = async () => {
    try {
      await supabase.auth.resetPasswordForEmail(user?.email);
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

              {/* Push notifications — triggers browser permission prompt on first enable */}
              <div className="settings-row">
                <div className="settings-row-icon" style={{ background: '#FF9500' }}>🔔</div>
                <div className="settings-row-content">
                  <div className="settings-row-title">Push Notifications</div>
                </div>
                <Toggle on={notifEnabled} onToggle={handleNotifToggle} />
              </div>

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
                </div>
                {/* Show current value in muted text + arrow */}
                <div className="settings-row-right" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>{profileVis}</span>
                  <ChevronRight size={16} />
                </div>
              </button>

              {/* Show my location — controls whether check-in location is visible to others */}
              <div className="settings-row">
                <div className="settings-row-icon" style={{ background: '#30D158' }}>📍</div>
                <div className="settings-row-content">
                  <div className="settings-row-title">Show My Location</div>
                  <div className="settings-row-desc">Visible during court check-ins</div>
                </div>
                <Toggle on={showLocation} onToggle={handleLocationToggle} />
              </div>

            </div>
          </div>

          {/* ── Section 5: Support ──────────────────────────────────────────── */}
          <div>
            <div className="settings-section-label">Support</div>
            <div className="settings-group">

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

      {/* Toast notification — shown above the sheet so messages are visible */}
      <Toast message={toast} />
    </>
  );
}
