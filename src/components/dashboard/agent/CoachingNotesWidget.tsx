'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Calendar, ChevronDown, ChevronUp, User } from 'lucide-react';
import { useUser } from '@/firebase';
import { format, parseISO } from 'date-fns';

interface CoachingNote {
  id: string;
  agentId: string;
  authorId: string;
  authorName: string;
  authorRole: 'dad' | 'broker' | 'admin';
  note: string;
  category?: 'general' | 'goal_review' | 'performance' | 'action_item' | 'plan_reset';
  createdAt: string;
  oneOnOneId?: string;
}

interface OneOnOne {
  id: string;
  scheduledDate: string;
  scheduledTime?: string;
  type: string;
  status: string;
  notes?: string;
  completionNotes?: string;
}

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  general: { label: 'General', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  goal_review: { label: 'Goal Review', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  performance: { label: 'Performance', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  action_item: { label: 'Action Item', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  plan_reset: { label: 'Plan Reset', color: 'bg-orange-100 text-orange-700 border-orange-300' },
};

const ONE_ON_ONE_TYPE_LABELS: Record<string, string> = {
  weekly: 'Weekly 1:1',
  monthly: 'Monthly 1:1',
  requested: 'Requested 1:1',
  ad_hoc: 'Ad Hoc 1:1',
};

interface Props {
  agentId?: string; // if provided, shows notes for that agent (admin view); otherwise uses current user
  compact?: boolean;
}

export function CoachingNotesWidget({ agentId, compact = false }: Props) {
  const { user } = useUser();
  const [notes, setNotes] = useState<CoachingNote[]>([]);
  const [upcomingOneOnOnes, setUpcomingOneOnOnes] = useState<OneOnOne[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [requestingOneOnOne, setRequestingOneOnOne] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  const targetAgentId = agentId || user?.uid;

  const fetchData = useCallback(async () => {
    if (!user || !targetAgentId) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const [notesRes, oneOnOneRes] = await Promise.all([
        fetch(`/api/agent/coaching-notes?agentId=${targetAgentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/agent/one-on-ones?agentId=${targetAgentId}&upcoming=true`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (notesRes.ok) {
        const d = await notesRes.json();
        setNotes(d.notes || []);
      }
      if (oneOnOneRes.ok) {
        const d = await oneOnOneRes.json();
        const today = new Date().toISOString().split('T')[0];
        setUpcomingOneOnOnes((d.oneOnOnes || []).filter((o: OneOnOne) => o.status === 'scheduled' && o.scheduledDate >= today).slice(0, 3));
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [user, targetAgentId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRequestOneOnOne = async () => {
    if (!user) return;
    setRequestingOneOnOne(true);
    try {
      const token = await user.getIdToken();
      await fetch('/api/agent/one-on-ones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          agentId: user.uid,
          agentName: user.displayName || 'Agent',
          scheduledDate: '',
          type: 'requested',
          notes: 'Agent requested a 1:1 meeting.',
          requestedBy: 'agent',
        }),
      });
      setRequestSent(true);
    } catch { /* ignore */ }
    finally { setRequestingOneOnOne(false); }
  };

  const displayNotes = showAll ? notes : notes.slice(0, compact ? 2 : 4);
  const hasMore = notes.length > (compact ? 2 : 4);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4 text-blue-600" />Coaching Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2].map(i => <div key={i} className="h-16 bg-muted/40 rounded animate-pulse" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-blue-600" />
            <CardTitle className="text-base">Coaching Notes</CardTitle>
            {notes.length > 0 && (
              <Badge variant="outline" className="text-xs">{notes.length} note{notes.length !== 1 ? 's' : ''}</Badge>
            )}
          </div>
          {/* Agent can request a 1:1 — only show when viewing own dashboard */}
          {!agentId && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs text-purple-600 border-purple-200 hover:bg-purple-50"
              onClick={handleRequestOneOnOne}
              disabled={requestingOneOnOne || requestSent}
            >
              <Calendar className="h-3.5 w-3.5 mr-1.5" />
              {requestSent ? '✓ Request Sent' : requestingOneOnOne ? 'Sending...' : 'Request 1:1'}
            </Button>
          )}
        </div>
        {!agentId && (
          <CardDescription className="text-xs">
            Notes from your Director of Agent Development and Broker. Tap "Request 1:1" to schedule a meeting.
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">

        {/* Upcoming 1:1s */}
        {upcomingOneOnOnes.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-purple-600 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />Upcoming 1:1 Meetings
            </p>
            {upcomingOneOnOnes.map(o => (
              <div key={o.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-purple-50/30 border-purple-200 text-sm">
                <Calendar className="h-4 w-4 text-purple-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{ONE_ON_ONE_TYPE_LABELS[o.type] || o.type}</p>
                  <p className="text-xs text-muted-foreground">
                    {o.scheduledDate}{o.scheduledTime ? ` at ${o.scheduledTime}` : ''}
                    {o.notes && ` · ${o.notes}`}
                  </p>
                </div>
                <Badge className="bg-purple-100 text-purple-800 border-purple-300 text-[10px] shrink-0">Scheduled</Badge>
              </div>
            ))}
          </div>
        )}

        {/* Coaching Notes */}
        {notes.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No coaching notes yet.</p>
            {!agentId && (
              <p className="text-xs mt-1">Your DAD and Broker will add notes here after meetings and check-ins.</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" />Notes from Your Team
            </p>
            {displayNotes.map(note => {
              const cat = CATEGORY_LABELS[note.category || 'general'];
              return (
                <div key={note.id} className="p-3 rounded-lg border bg-muted/20 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold">{note.authorName}</span>
                      <Badge className={`text-[10px] px-1.5 py-0.5 border ${cat.color}`}>{cat.label}</Badge>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {note.createdAt ? format(parseISO(note.createdAt), 'MMM d, yyyy') : ''}
                    </span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">{note.note}</p>
                </div>
              );
            })}
            {hasMore && (
              <Button variant="ghost" size="sm" className="w-full text-xs h-7" onClick={() => setShowAll(s => !s)}>
                {showAll
                  ? <><ChevronUp className="h-3.5 w-3.5 mr-1" />Show Less</>
                  : <><ChevronDown className="h-3.5 w-3.5 mr-1" />Show All {notes.length} Notes</>}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
