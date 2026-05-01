import { useState, useRef, useEffect } from 'react';
import { Heart, MessageCircle, Share2, MoreHorizontal, Play, MapPin, Send, Trash2 } from 'lucide-react';
import Avatar from './Avatar';
import { sendLocalNotification } from '../utils/notificationStore';
import { useComments } from '../hooks/useComments';

const ACTION_TEXT = {
  checkin: (court) => `checked in at ${court}`,
  status:  ()       => 'posted a status',
  photo:   ()       => 'shared a photo',
  video:   ()       => 'shared a video',
  repost:  ()       => 'reposted',
};

// currentUser — object with { id, username, avatarUrl } for the logged-in user.
// Used to show the right avatar in the comment input and skip self-notifications.
export default function FeedPost({
  post,
  onPhotoTap,
  onToast,
  currentUser,
  onViewProfile,
  onCourtTap,
  onLike,
  onUnlike,
  onRepost,
}) {
  const [liked, setLiked]             = useState(post.isLiked);
  const [likeCount, setLikeCount]     = useState(post.likes);
  const [likeBusy, setLikeBusy]       = useState(false);
  const [repostBusy, setRepostBusy]   = useState(false);
  const [expanded, setExpanded]       = useState(false);
  const [showComments, setShowComments] = useState(false);

  // Local comment count — starts from whatever the post row says.
  // Gets overwritten with the real count once comments are fetched.
  const [commentCount, setCommentCount] = useState(post.comments ?? 0);

  // The text the user is typing in the comment input
  const [draft, setDraft] = useState('');

  const inputRef = useRef(null);

  const {
    comments,
    loading:    commentsLoading,
    submitting,
    fetchError: commentsFetchError,
    fetchComments,
    addComment,
    deleteComment,
  } = useComments();

  useEffect(() => {
    setLiked(post.isLiked);
    setLikeCount(post.likes);
  }, [post.id, post.isLiked, post.likes]);

  // ── Fetch comments the first time the section is opened ─────────────────
  // We use a ref to make sure we only fetch once per mount, not every toggle.
  const hasFetched = useRef(false);

  useEffect(() => {
    if (showComments && !hasFetched.current) {
      hasFetched.current = true;
      fetchComments(post.id);
    }
  }, [showComments, post.id, fetchComments]);

  // ── Keep comment count in sync with the fetched list ────────────────────
  useEffect(() => {
    if (hasFetched.current) {
      setCommentCount(comments.length);
    }
  }, [comments.length]);

  // ── Focus the input when the comment section opens ───────────────────────
  useEffect(() => {
    if (showComments && inputRef.current) {
      // Small delay so the slide-down animation finishes first
      setTimeout(() => inputRef.current?.focus(), 180);
    }
  }, [showComments]);

  // ── Like handler ─────────────────────────────────────────────────────────
  const handleLike = async () => {
    if (likeBusy) return;

    const wasLiked = liked;
    const previousCount = likeCount;
    const optimisticLiked = !wasLiked;

    setLikeBusy(true);
    setLiked(optimisticLiked);
    setLikeCount(c => optimisticLiked ? c + 1 : Math.max(0, c - 1));

    try {
      const next = optimisticLiked
        ? await onLike?.(post.id)
        : await onUnlike?.(post.id);

      if (next) {
        setLiked(next.isLiked);
        setLikeCount(next.likes);
      }

      if (optimisticLiked) {
        onToast?.('❤️ Liked');

        // Fire a notification when liking someone else's post
        if (currentUser?.id && post.userId !== currentUser.id) {
          sendLocalNotification(
            `You liked ${post.userName}'s post ❤️`,
            post.content
              ? post.content.slice(0, 60) + (post.content.length > 60 ? '…' : '')
              : `at ${post.courtName}`,
            '❤️'
          );
        }
      }
    } catch {
      setLiked(wasLiked);
      setLikeCount(previousCount);
      onToast?.('Failed to update like');
    } finally {
      setLikeBusy(false);
    }
  };

  // ── Submit a new comment ─────────────────────────────────────────────────
  const handleSubmitComment = async () => {
    const text = draft.trim();
    if (!text || !currentUser?.id || submitting) return;

    setDraft('');

    try {
      await addComment(post.id, currentUser.id, text);
      onToast?.('💬 Comment posted');
    } catch {
      onToast?.('Failed to post comment');
      // Restore the draft so the user doesn't lose what they typed
      setDraft(text);
    }
  };

  // Submit on Enter (but allow Shift+Enter for a newline)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitComment();
    }
  };

  // ── Delete a comment ─────────────────────────────────────────────────────
  const handleDelete = async (commentId) => {
    try {
      await deleteComment(commentId);
      onToast?.('Comment deleted');
    } catch {
      onToast?.('Failed to delete comment');
    }
  };

  const handleRepost = async () => {
    if (repostBusy) return;

    const originalId = post.repostOfPostId ?? post.id;
    setRepostBusy(true);

    try {
      const result = await onRepost?.(originalId);
      if (result?.alreadyReposted) {
        onToast?.('Already reposted');
      } else {
        onToast?.('Reposted to your feed');
      }
    } catch {
      onToast?.('Failed to repost');
    } finally {
      setRepostBusy(false);
    }
  };

  const actionText = ACTION_TEXT[post.type]?.(post.courtName) ?? '';
  const hasContent = !!post.content;
  const needsTrunc = hasContent && post.content.length > 120;
  const original = post.originalPost;

  // The logged-in user's initials and avatar for the comment input row
  const myInitials  = (currentUser?.username ?? 'PL').slice(0, 2).toUpperCase();
  const myAvatarUrl = currentUser?.avatarUrl ?? null;

  return (
    <div className="feed-post">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="feed-post-header">
        <button
          className="feed-post-author-btn"
          onClick={() => onViewProfile?.(post.userId)}
          aria-label={`View ${post.userName}'s profile`}
        >
          <Avatar
            avatarUrl={post.userAvatarUrl}
            initials={post.userInitials}
            size="medium"
          />
        </button>
        <div className="feed-post-meta">
          <button
            className="feed-post-name-btn"
            onClick={() => onViewProfile?.(post.userId)}
          >
            {post.userName}
          </button>
          <span className="feed-post-action">{actionText}</span>
          <span className="feed-post-time">{post.timeAgo}</span>
        </div>
        <button className="feed-more-btn" aria-label="More options">
          <MoreHorizontal size={18} strokeWidth={2} color="var(--text-secondary)" />
        </button>
      </div>

      {/* ── Text content ────────────────────────────────────────────────── */}
      {hasContent && (
        <div className="feed-post-content">
          <p
            style={{
              WebkitLineClamp: expanded ? 'unset' : 3,
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              overflow: expanded ? 'visible' : 'hidden',
            }}
          >
            {post.content}
          </p>
          {needsTrunc && !expanded && (
            <button className="feed-see-more" onClick={() => setExpanded(true)}>
              See more
            </button>
          )}
        </div>
      )}

      {/* ── Media ───────────────────────────────────────────────────────── */}
      {post.mediaUrl && (
        <div
          className="feed-post-media"
          onClick={() => post.mediaType === 'image' && onPhotoTap?.(post.mediaUrl)}
          style={{ cursor: post.mediaType === 'image' ? 'pointer' : 'default' }}
        >
          <img src={post.mediaUrl} alt="" />
          {post.mediaType === 'video' && (
            <div className="feed-play-overlay">
              <div className="feed-play-btn">
                <Play size={28} fill="#fff" color="#fff" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Court tag pill — tappable for any post with a tagged court ─── */}
      {post.courtId && (
        <button
          className="feed-checkin-pill"
          onClick={() => onCourtTap?.(post.courtId)}
          aria-label={`View ${post.courtName} details`}
        >
          <MapPin size={12} color="var(--orange)" strokeWidth={2.5} />
          <span>{post.courtName}</span>
          <span className="feed-court-pill-hint">→</span>
        </button>
      )}

      {/* ── Repost preview ──────────────────────────────────────────────── */}
      {original && (
        <div className="feed-repost-preview">
          <div className="feed-repost-header">
            <Avatar
              avatarUrl={original.userAvatarUrl}
              initials={original.userInitials}
              size={28}
            />
            <div className="feed-repost-meta">
              <button
                className="feed-post-name-btn"
                onClick={() => onViewProfile?.(original.userId)}
              >
                {original.userName}
              </button>
              <span>{ACTION_TEXT[original.type]?.(original.courtName) ?? 'posted'} · {original.timeAgo}</span>
            </div>
          </div>

          {original.content && (
            <div className="feed-repost-content">{original.content}</div>
          )}

          {original.mediaUrl && (
            <div
              className="feed-repost-media"
              onClick={() => original.mediaType === 'image' && onPhotoTap?.(original.mediaUrl)}
            >
              <img src={original.mediaUrl} alt="" />
            </div>
          )}

          {original.courtId && (
            <button
              className="feed-checkin-pill feed-repost-court"
              onClick={() => onCourtTap?.(original.courtId)}
              aria-label={`View ${original.courtName} details`}
            >
              <MapPin size={12} color="var(--orange)" strokeWidth={2.5} />
              <span>{original.courtName}</span>
              <span className="feed-court-pill-hint">→</span>
            </button>
          )}
        </div>
      )}

      {/* ── Action bar ──────────────────────────────────────────────────── */}
      <div className="feed-action-bar">
        <button
          className={`feed-action-btn${liked ? ' liked' : ''}`}
          onClick={handleLike}
          disabled={likeBusy}
          aria-label="Like"
        >
          <Heart
            size={20}
            strokeWidth={2}
            fill={liked ? '#FF375F' : 'none'}
            color={liked ? '#FF375F' : 'var(--text-secondary)'}
          />
          <span>{likeCount}</span>
        </button>

        <button
          className="feed-action-btn"
          onClick={() => setShowComments(v => !v)}
          aria-label="Comment"
        >
          <MessageCircle
            size={20}
            strokeWidth={2}
            color={showComments ? 'var(--orange)' : 'var(--text-secondary)'}
          />
          <span style={{ color: showComments ? 'var(--orange)' : undefined }}>
            {commentCount}
          </span>
        </button>

        <button
          className="feed-action-btn"
          onClick={handleRepost}
          disabled={repostBusy}
          aria-label="Repost"
        >
          <Share2 size={20} strokeWidth={2} color="var(--text-secondary)" />
        </button>
      </div>

      {/* ── Comments section ────────────────────────────────────────────── */}
      {showComments && (
        <div className="feed-comments">

          {/* Loading state */}
          {commentsLoading && (
            <div className="feed-comments-loading">Loading comments…</div>
          )}

          {/* Error state */}
          {!commentsLoading && commentsFetchError && (
            <div className="feed-comments-empty">
              Failed to load comments —{' '}
              <button
                style={{ background: 'none', border: 'none', color: 'var(--orange)', cursor: 'pointer', padding: 0, font: 'inherit' }}
                onClick={() => fetchComments(post.id)}
              >
                tap to retry
              </button>
            </div>
          )}

          {/* Empty state — only show after loading is done and no error */}
          {!commentsLoading && !commentsFetchError && comments.length === 0 && (
            <div className="feed-comments-empty">
              No comments yet. Be the first!
            </div>
          )}

          {/* Comment list */}
          {!commentsLoading && comments.map(c => (
            <div key={c.id} className="feed-comment">
              <Avatar avatarUrl={c.avatarUrl} initials={c.initials} size={28} />
              <div className="feed-comment-bubble">
                <div className="feed-comment-header">
                  <span className="feed-comment-name">{c.username}</span>
                  <span className="feed-comment-time">{c.timeAgo}</span>
                </div>
                <span className="feed-comment-text">{c.content}</span>
              </div>
              {/* Show delete button only on the user's own comments */}
              {c.userId === currentUser?.id && (
                <button
                  className="feed-comment-delete"
                  onClick={() => handleDelete(c.id)}
                  aria-label="Delete comment"
                >
                  <Trash2 size={13} strokeWidth={2} />
                </button>
              )}
            </div>
          ))}

          {/* Comment input row */}
          <div className="feed-comment-input-row">
            <Avatar avatarUrl={myAvatarUrl} initials={myInitials} size={28} />
            <div className="feed-comment-input-wrap">
              <input
                ref={inputRef}
                className="feed-comment-input"
                placeholder="Add a comment…"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={500}
                disabled={submitting}
              />
              {draft.trim().length > 0 && (
                <button
                  className="feed-comment-send"
                  onClick={handleSubmitComment}
                  disabled={submitting}
                  aria-label="Post comment"
                >
                  <Send size={15} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
