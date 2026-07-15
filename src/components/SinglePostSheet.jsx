// src/components/SinglePostSheet.jsx
//
// Full-screen overlay showing ONE post — opened when the user taps a push
// notification like "X commented on your post" or "X liked your post".
// The feed can't deep-link to a post (it might not be in the first page),
// so we fetch the single post by ID and render it with the standard
// FeedPost component, comments pre-opened for comment notifications.
//
// Props:
//   postId       — the post to show
//   showComments — true → FeedPost opens with the comment section visible
//   currentUser  — { id, username, avatarUrl } of the logged-in user
//   onClose      — dismiss the sheet
//   onViewProfile — navigate to a tapped username's profile

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import FeedPost from './FeedPost';
import PhotoViewer from './PhotoViewer';
import Toast from './Toast';
import { useToast } from '../hooks/useToast';
import { usePosts } from '../hooks/usePosts';
import { supabase } from '../lib/supabase';

export default function SinglePostSheet({ postId, showComments = false, currentUser, onClose, onViewProfile, onBlock }) {
  const [post, setPost]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [photoUrl, setPhotoUrl] = useState(null);

  const { toast, showToast } = useToast();
  const { fetchPostById, likePost, unlikePost, createRepost, deletePost } = usePosts();

  useEffect(() => {
    setLoading(true);
    fetchPostById(postId, currentUser?.id).then(p => {
      setPost(p);
      setLoading(false);
    });
  }, [postId]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchLike = (next) => {
    if (next) setPost(prev => prev ? { ...prev, likes: next.likes, isLiked: next.isLiked } : prev);
  };

  return (
    <div className="single-post-overlay">
      {/* Header bar with close button */}
      <div className="single-post-header">
        <span className="single-post-title">Post</span>
        <button className="single-post-close" onClick={onClose} aria-label="Close">
          <X size={20} strokeWidth={2} />
        </button>
      </div>

      <div className="single-post-body">
        {loading && (
          <div className="feed-skeleton">
            <div className="feed-skeleton-card" />
          </div>
        )}

        {!loading && !post && (
          <div className="feed-empty">
            <div style={{ fontSize: 48 }}>🏀</div>
            <div className="feed-empty-title">Post not found</div>
            <div className="feed-empty-sub">It may have been deleted</div>
          </div>
        )}

        {!loading && post && (
          <FeedPost
            post={post}
            initialShowComments={showComments}
            onPhotoTap={setPhotoUrl}
            onToast={showToast}
            currentUser={currentUser}
            onViewProfile={(uid) => { onClose(); onViewProfile?.(uid); }}
            onLike={async (id) => { const next = await likePost(id, currentUser?.id); patchLike(next); return next; }}
            onUnlike={async (id) => { const next = await unlikePost(id, currentUser?.id); patchLike(next); return next; }}
            onRepost={(id) => createRepost(id, currentUser?.id)}
            onDelete={async (id) => { await deletePost(id); onClose(); }}
            onReport={async (id) => {
              try {
                await supabase.from('post_reports').insert({ post_id: id, reported_by: currentUser?.id });
              } catch { /* silent — toast shown by FeedPost */ }
            }}
            onBlock={onBlock}
          />
        )}
      </div>

      <PhotoViewer url={photoUrl} onClose={() => setPhotoUrl(null)} />
      <Toast message={toast} />
    </div>
  );
}
