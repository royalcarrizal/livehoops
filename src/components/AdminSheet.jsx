// src/components/AdminSheet.jsx
//
// The in-app moderation panel, opened from Settings → Admin (only visible
// to profiles with is_admin = true). Two tabs:
//
//   Courts  — user-submitted courts waiting for review.
//             Approve → court goes live on the map for everyone.
//             Reject  → submission is deleted.
//
//   Reports — posts that users flagged, grouped per post with a count.
//             Dismiss → clears the reports, post stays up.
//             Delete  → removes the post (and its reports).
//
// All actions go through admin_* RPCs (supabase/admin_moderation.sql) that
// verify is_admin server-side — this screen is a convenience, not the gate.

import { useState, useEffect, useCallback } from 'react';
import { X, Check, Trash2, ShieldOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../hooks/useToast';
import Toast from './Toast';

export default function AdminSheet({ onClose }) {
  const [tab, setTab]           = useState('courts'); // 'courts' | 'reports'
  const [courtsList, setCourts] = useState([]);
  const [reports, setReports]   = useState([]);
  const [loading, setLoading]   = useState(true);
  // IDs with an action in flight, so buttons disable instantly
  const [busy, setBusy]         = useState(new Set());

  const { toast, showToast } = useToast();

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [courtsRes, reportsRes] = await Promise.all([
      supabase.rpc('admin_list_pending_courts'),
      supabase.rpc('admin_list_reports'),
    ]);
    if (courtsRes.error)  console.error('admin courts error:',  courtsRes.error);
    if (reportsRes.error) console.error('admin reports error:', reportsRes.error);
    setCourts(courtsRes.data ?? []);
    setReports(reportsRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const withBusy = async (id, fn) => {
    setBusy(prev => new Set([...prev, id]));
    try { await fn(); }
    finally {
      setBusy(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  // ── Court actions ─────────────────────────────────────────────────────────
  const reviewCourt = (courtId, approve) => withBusy(courtId, async () => {
    const { error } = await supabase.rpc('admin_review_court', {
      p_court_id: courtId,
      p_approve:  approve,
    });
    if (error) {
      showToast('❌ Action failed — try again');
      return;
    }
    setCourts(prev => prev.filter(c => c.id !== courtId));
    showToast(approve ? '✅ Court approved — now live' : 'Submission rejected');
  });

  // ── Report actions ────────────────────────────────────────────────────────
  const resolveReport = (postId, deletePost) => withBusy(postId, async () => {
    const { error } = await supabase.rpc('admin_resolve_report', {
      p_post_id:     postId,
      p_delete_post: deletePost,
    });
    if (error) {
      showToast('❌ Action failed — try again');
      return;
    }
    setReports(prev => prev.filter(r => r.post_id !== postId));
    showToast(deletePost ? '🗑️ Post deleted' : 'Reports dismissed');
  });

  return (
    <div className="single-post-overlay">
      {/* Header */}
      <div className="single-post-header">
        <span className="single-post-title">Admin · Moderation</span>
        <button className="single-post-close" onClick={onClose} aria-label="Close">
          <X size={20} strokeWidth={2} />
        </button>
      </div>

      {/* Tab toggle — reuses the feed tab styling */}
      <div className="feed-tab-row" style={{ margin: '12px 20px' }}>
        <button
          className={`feed-tab-btn${tab === 'courts' ? ' active' : ''}`}
          onClick={() => setTab('courts')}
        >
          Courts{courtsList.length > 0 ? ` (${courtsList.length})` : ''}
        </button>
        <button
          className={`feed-tab-btn${tab === 'reports' ? ' active' : ''}`}
          onClick={() => setTab('reports')}
        >
          Reports{reports.length > 0 ? ` (${reports.length})` : ''}
        </button>
      </div>

      <div className="single-post-body" style={{ padding: '0 20px 40px' }}>

        {loading && (
          <div className="feed-comments-loading" style={{ padding: '32px 0', textAlign: 'center' }}>
            Loading…
          </div>
        )}

        {/* ── Courts tab ─────────────────────────────────────────────────── */}
        {!loading && tab === 'courts' && (
          courtsList.length === 0 ? (
            <div className="feed-empty">
              <div style={{ fontSize: 48 }}>✅</div>
              <div className="feed-empty-title">No pending courts</div>
              <div className="feed-empty-sub">New submissions will appear here</div>
            </div>
          ) : (
            courtsList.map(court => (
              <div key={court.id} className="admin-card">
                {court.photo_url && (
                  <img className="admin-card-photo" src={court.photo_url} alt={court.name} />
                )}
                <div className="admin-card-title">{court.name}</div>
                <div className="admin-card-sub">
                  {court.address}, {court.city}
                  {' · '}{court.courts ?? 1} {court.courts === 1 ? 'court' : 'courts'}
                  {court.surface ? ` · ${court.surface}` : ''}
                </div>
                <div className="admin-card-meta">
                  Submitted by {court.submitted_by_username ?? 'unknown'}
                </div>
                <div className="admin-card-actions">
                  <button
                    className="admin-btn approve"
                    disabled={busy.has(court.id)}
                    onClick={() => reviewCourt(court.id, true)}
                  >
                    <Check size={15} strokeWidth={2.5} /> Approve
                  </button>
                  <button
                    className="admin-btn reject"
                    disabled={busy.has(court.id)}
                    onClick={() => reviewCourt(court.id, false)}
                  >
                    <Trash2 size={15} strokeWidth={2} /> Reject
                  </button>
                </div>
              </div>
            ))
          )
        )}

        {/* ── Reports tab ────────────────────────────────────────────────── */}
        {!loading && tab === 'reports' && (
          reports.length === 0 ? (
            <div className="feed-empty">
              <div style={{ fontSize: 48 }}>✅</div>
              <div className="feed-empty-title">No reported posts</div>
              <div className="feed-empty-sub">Reports from users will appear here</div>
            </div>
          ) : (
            reports.map(report => (
              <div key={report.post_id} className="admin-card">
                <div className="admin-card-title">
                  {report.author_username ?? 'Unknown user'}
                  <span className="admin-report-count">
                    {report.report_count} {Number(report.report_count) === 1 ? 'report' : 'reports'}
                  </span>
                </div>
                {report.content && (
                  <div className="admin-card-sub">"{report.content}"</div>
                )}
                {report.image_url && (
                  <img className="admin-card-photo" src={report.image_url} alt="Reported post" />
                )}
                <div className="admin-card-actions">
                  <button
                    className="admin-btn approve"
                    disabled={busy.has(report.post_id)}
                    onClick={() => resolveReport(report.post_id, false)}
                  >
                    <ShieldOff size={15} strokeWidth={2} /> Dismiss
                  </button>
                  <button
                    className="admin-btn reject"
                    disabled={busy.has(report.post_id)}
                    onClick={() => resolveReport(report.post_id, true)}
                  >
                    <Trash2 size={15} strokeWidth={2} /> Delete Post
                  </button>
                </div>
              </div>
            ))
          )
        )}
      </div>

      <Toast message={toast} />
    </div>
  );
}
