// src/components/LegalSheet.jsx
//
// A full-height slide-up sheet that displays either the Privacy Policy or
// Terms of Service directly inside the app — no external URL needed.
//
// Props:
//   type    — 'privacy' | 'terms' | null
//   onClose — called when the user taps the close button or backdrop

import { ChevronLeft } from 'lucide-react';

// ── Privacy Policy content ────────────────────────────────────────────────────
function PrivacyPolicy() {
  return (
    <>
      <p className="legal-meta">Last updated: April 29, 2026</p>

      <h2 className="legal-section-title">1. What We Collect</h2>
      <p className="legal-body">
        When you create an account, we collect your email address and a username
        you choose. Your password is never stored in readable form — it is handled
        entirely by Supabase's secure authentication system.
      </p>
      <p className="legal-body">When you use the app, we may collect:</p>
      <ul className="legal-list">
        <li>Your GPS location, used to calculate your distance from basketball courts and to record where you checked in</li>
        <li>A profile photo, if you choose to upload one</li>
        <li>Posts you create, including text and photos you share</li>
        <li>Check-in history, including which courts you visited, when, and how long you stayed</li>
        <li>Your friend connections within the app</li>
      </ul>
      <p className="legal-body">
        We also store small pieces of preference data on your device (such as your
        theme setting and notification preferences) using your browser's local
        storage. This data never leaves your device.
      </p>

      <h2 className="legal-section-title">2. How We Use Your Information</h2>
      <p className="legal-body">
        We use your information only to operate LiveHoops. Specifically:
      </p>
      <ul className="legal-list">
        <li>Your email is used to log you in and send password reset emails</li>
        <li>Your GPS location is used to show distances to courts and to record your check-in location</li>
        <li>Your posts and check-ins are shown to other users of the app</li>
        <li>Your friend connections are used to power your feed and the friends list</li>
      </ul>
      <p className="legal-body">
        We do not sell your data. We do not use your data for advertising. We do
        not share your data with third parties except as described in Section 3.
      </p>

      <h2 className="legal-section-title">3. Third-Party Services</h2>
      <p className="legal-body">LiveHoops uses the following third-party services to operate:</p>
      <ul className="legal-list">
        <li><strong>Supabase</strong> — stores your account, profile, posts, check-ins, and photos</li>
        <li><strong>Mapbox</strong> — powers the interactive court map and converts GPS coordinates into a readable city name when you check in</li>
        <li><strong>Firebase</strong> — used for push notifications if you enable them</li>
      </ul>

      <h2 className="legal-section-title">4. Data You Can Delete</h2>
      <p className="legal-body">
        You can delete your account at any time from the Settings screen. When you
        delete your account, your profile, posts, check-ins, and friend connections
        are permanently removed from our database. Profile photos stored in Supabase
        Storage are also deleted.
      </p>

      <h2 className="legal-section-title">5. Children's Privacy</h2>
      <p className="legal-body">
        LiveHoops is not directed at children under the age of 13. We do not
        knowingly collect personal information from children under 13. If you
        believe a child has provided us with personal information, please contact
        us so we can remove it.
      </p>

      <h2 className="legal-section-title">6. Changes to This Policy</h2>
      <p className="legal-body">
        If we make significant changes to this policy, we will update the date at
        the top of this page. Continued use of the app after changes are posted
        means you accept the updated policy.
      </p>

      <h2 className="legal-section-title">7. Contact</h2>
      <p className="legal-body">
        If you have questions about this privacy policy or your data, contact us
        at: <strong>royalanthony96@gmail.com</strong>
      </p>
    </>
  );
}

// ── Terms of Service content ──────────────────────────────────────────────────
function TermsOfService() {
  return (
    <>
      <p className="legal-meta">Last updated: April 29, 2026</p>

      <h2 className="legal-section-title">1. Acceptance</h2>
      <p className="legal-body">
        By creating an account and using LiveHoops, you agree to these Terms of
        Service. If you do not agree, do not use the app.
      </p>

      <h2 className="legal-section-title">2. Your Account</h2>
      <p className="legal-body">
        You are responsible for keeping your account credentials secure. You must
        provide a real email address and may not impersonate another person or
        create accounts on behalf of someone else. You must be at least 13 years
        old to use LiveHoops.
      </p>

      <h2 className="legal-section-title">3. What You Can Post</h2>
      <p className="legal-body">
        LiveHoops is a community for basketball players. You agree not to post
        content that:
      </p>
      <ul className="legal-list">
        <li>Is illegal, threatening, or harassing</li>
        <li>Infringes someone else's copyright or intellectual property</li>
        <li>Contains nudity, graphic violence, or sexually explicit material</li>
        <li>Is spam or intentionally misleading</li>
      </ul>
      <p className="legal-body">
        We reserve the right to remove content that violates these rules and to
        suspend or delete accounts that repeatedly violate them.
      </p>

      <h2 className="legal-section-title">4. Your Content</h2>
      <p className="legal-body">
        You own the content you post on LiveHoops — your photos, posts, and
        check-ins belong to you. By posting content, you give LiveHoops a license
        to display that content to other users of the app. We do not claim
        ownership of your content and will not use it for any purpose outside of
        operating the app.
      </p>

      <h2 className="legal-section-title">5. Location Data</h2>
      <p className="legal-body">
        LiveHoops requests access to your GPS location to calculate distances to
        basketball courts and to record where you check in. Location access is
        optional — you can use most of the app without granting it. You can revoke
        location permission at any time in your device settings.
      </p>

      <h2 className="legal-section-title">6. Service Availability</h2>
      <p className="legal-body">
        We do our best to keep LiveHoops running, but we do not guarantee the app
        will be available at all times. We may update, pause, or discontinue the
        app at any time. We are not liable for any loss of data or access resulting
        from outages or changes to the service.
      </p>

      <h2 className="legal-section-title">7. Limitation of Liability</h2>
      <p className="legal-body">
        LiveHoops is provided as-is. To the fullest extent permitted by law, we
        are not liable for any damages arising from your use of the app, including
        but not limited to data loss, personal injury, or disputes with other
        users. Use of LiveHoops for physical activity (including visiting
        basketball courts) is at your own risk.
      </p>

      <h2 className="legal-section-title">8. Changes to These Terms</h2>
      <p className="legal-body">
        We may update these terms from time to time. The date at the top of this
        page reflects the most recent version. Continued use of the app after
        changes are posted means you accept the updated terms.
      </p>

      <h2 className="legal-section-title">9. Contact</h2>
      <p className="legal-body">
        For questions about these terms, contact us at:{' '}
        <strong>royalanthony96@gmail.com</strong>
      </p>
    </>
  );
}

// ── LegalSheet ────────────────────────────────────────────────────────────────
export default function LegalSheet({ type, onClose }) {
  if (!type) return null;

  const isPrivacy = type === 'privacy';
  const title     = isPrivacy ? 'Privacy Policy' : 'Terms of Service';

  return (
    <>
      {/* Backdrop */}
      <div className="legal-overlay" onClick={onClose} />

      {/* Sheet */}
      <div className="legal-sheet">
        {/* Header */}
        <div className="legal-header">
          <button className="legal-back-btn" onClick={onClose} aria-label="Back">
            <ChevronLeft size={20} strokeWidth={2.5} />
          </button>
          <span className="legal-title">{title}</span>
          {/* Spacer so title stays centered */}
          <div style={{ width: 32 }} />
        </div>

        {/* Scrollable content */}
        <div className="legal-body-scroll">
          {isPrivacy ? <PrivacyPolicy /> : <TermsOfService />}
          <div style={{ height: 40 }} />
        </div>
      </div>
    </>
  );
}
