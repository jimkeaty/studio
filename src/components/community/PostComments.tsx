'use client';

/**
 * PostComments
 *
 * Displays a comment thread for a community post.
 * - TV mode: visible but read-only (no auth, no input box)
 * - Dashboard: logged-in agents can add comments
 *
 * Props:
 *   collection  — Firestore collection name (buyerNeeds, comingSoonListings, etc.)
 *   postId      — document ID of the parent post
 *   readOnly    — if true, hides the input box (TV mode)
 *   getToken    — async function that returns the Firebase ID token (dashboard only)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, Send, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface Comment {
  id: string;
  text: string;
  agentName: string;
  agentProfileId: string;
  createdAt: string;
}

interface PostCommentsProps {
  collection: string;
  postId: string;
  readOnly?: boolean;
  getToken?: () => Promise<string | null>;
  /** compact mode for TV display — shows only count + latest comment */
  compact?: boolean;
}

export function PostComments({
  collection,
  postId,
  readOnly = false,
  getToken,
  compact = false,
}: PostCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!compact);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/community/comments?collection=${encodeURIComponent(collection)}&postId=${encodeURIComponent(postId)}`
      );
      const data = await res.json();
      if (data.ok) setComments(data.comments ?? []);
    } catch {
      // silently fail — comments are non-critical
    } finally {
      setLoading(false);
    }
  }, [collection, postId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleSubmit = async () => {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = getToken ? await getToken() : null;
      if (!token) {
        setError('You must be logged in to comment.');
        return;
      }
      const res = await fetch('/api/community/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ collection, postId, text: text.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setText('');
        await fetchComments();
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      } else {
        setError(data.error || 'Failed to post comment.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
        ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } catch { return iso; }
  };

  if (compact && !expanded) {
    return (
      <div className="mt-2">
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {comments.length === 0
            ? 'No comments yet'
            : `${comments.length} comment${comments.length !== 1 ? 's' : ''}`}
          {comments.length > 0 && (
            <>
              <span className="mx-1">·</span>
              <span className="truncate max-w-[180px]">{comments[comments.length - 1]?.text}</span>
            </>
          )}
          <ChevronDown className="h-3 w-3 ml-1" />
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t pt-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <MessageSquare className="h-3.5 w-3.5" />
          {comments.length === 0 ? 'No comments' : `${comments.length} comment${comments.length !== 1 ? 's' : ''}`}
        </div>
        {compact && (
          <button
            onClick={() => setExpanded(false)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Comment list */}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading comments…
        </div>
      ) : comments.length > 0 ? (
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {comments.map((c) => (
            <div key={c.id} className="bg-muted/40 rounded-lg px-3 py-2">
              <div className="flex items-baseline justify-between gap-2 mb-0.5">
                <span className="text-xs font-semibold text-foreground">{c.agentName}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{formatTime(c.createdAt)}</span>
              </div>
              <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">{c.text}</p>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic py-1">
          {readOnly ? 'No comments yet.' : 'Be the first to comment.'}
        </p>
      )}

      {/* Input area — hidden in read-only mode */}
      {!readOnly && (
        <div className="mt-3 space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a note (e.g. 'You should talk to Lena, I think she has a house coming up like this')"
            className="text-xs min-h-[60px] resize-none"
            maxLength={1000}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">{text.length}/1000 · Cmd+Enter to post</span>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!text.trim() || submitting}
              className="h-7 text-xs"
            >
              {submitting ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Send className="h-3 w-3 mr-1" />
              )}
              Post
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
