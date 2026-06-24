'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { format, nextThursday, parseISO, isThisWeek, startOfWeek, endOfWeek, addWeeks } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Home, Clock, Calendar, Phone, FileText, CheckCircle2,
  AlertCircle, Plus, Loader2, ArrowLeft, Info, Pencil, X, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Submission = {
  id: string;
  agentName: string;
  agentPhone?: string;
  propertyAddress?: string;
  mlsNumber?: string;
  openHouseDate: string;
  startTime: string;
  endTime: string;
  specialNotes?: string;
  status: 'pending' | 'email_sent' | 'cancelled';
  checklist?: { mls: boolean; boomtown: boolean; email: boolean };
  cancelReason?: string;
  createdAt: string;
  emailSentAt?: string;
  changeHistory?: any[];
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending:    { label: 'Pending Review', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: '⏳' },
  email_sent: { label: 'Completed',      color: 'bg-green-100 text-green-800 border-green-200', icon: '✅' },
  cancelled:  { label: 'Cancelled',      color: 'bg-red-100 text-red-800 border-red-200',       icon: '❌' },
};

function isPastDeadline() {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  return (day === 4 && hour >= 12) || day === 5 || day === 6 || day === 0;
}

export default function OpenHouseSubmissionPage() {
  const { user } = useUser();
  const router = useRouter();
  const { toast } = useToast();

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // New submission form state
  const [openHouseDate, setOpenHouseDate] = useState('');
  const [startTime, setStartTime] = useState('1:00 PM');
  const [endTime, setEndTime] = useState('4:00 PM');
  const [agentName, setAgentName] = useState('');
  const [agentPhone, setAgentPhone] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [mlsNumber, setMlsNumber] = useState('');
  const [specialNotes, setSpecialNotes] = useState('');

  // Edit sheet state
  const [editSub, setEditSub] = useState<Submission | null>(null);
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editMls, setEditMls] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Cancel dialog state
  const [cancelTarget, setCancelTarget] = useState<Submission | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const now = new Date();
  const thisThursday = nextThursday(now);
  const deadlineLabel = format(thisThursday, 'EEEE, MMMM d') + ' at noon';
  const isAfterDeadline = isPastDeadline();

  async function loadSubmissions() {
    if (!user) return;
    setLoading(true);
    try {
      const tok = await user.getIdToken();
      const res = await fetch('/api/agent/open-house-submissions', {
        headers: { Authorization: `Bearer ${tok}` },
      });
      const data = await res.json();
      if (data.ok) setSubmissions(data.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) {
      loadSubmissions();
      setAgentName(user.displayName || '');
    }
  }, [user]);

  // ── New submission ────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!openHouseDate || !startTime || !endTime || !agentName) {
      toast({ title: 'Missing fields', description: 'Date, times, and your name are required.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const tok = await user.getIdToken();
      const res = await fetch('/api/agent/open-house-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ openHouseDate, startTime, endTime, agentName, agentPhone, propertyAddress, mlsNumber, specialNotes }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Submission failed');
      toast({ title: '🏠 Open House Submitted!', description: 'Staff has been notified and will include your open house in the email blast.' });
      setShowForm(false);
      setOpenHouseDate(''); setStartTime('1:00 PM'); setEndTime('4:00 PM');
      setPropertyAddress(''); setMlsNumber(''); setSpecialNotes('');
      loadSubmissions();
    } catch (err: any) {
      toast({ title: 'Submission failed', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Open edit sheet ───────────────────────────────────────────────────────
  function openEdit(sub: Submission) {
    setEditSub(sub);
    setEditStartTime(sub.startTime);
    setEditEndTime(sub.endTime);
    setEditDate(sub.openHouseDate);
    setEditAddress(sub.propertyAddress || '');
    setEditMls(sub.mlsNumber || '');
    setEditNotes(sub.specialNotes || '');
  }

  // ── Save edit ─────────────────────────────────────────────────────────────
  async function handleSaveEdit() {
    if (!user || !editSub) return;
    setEditSaving(true);
    try {
      const tok = await user.getIdToken();
      const res = await fetch(`/api/agent/open-house-submissions?id=${editSub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({
          startTime: editStartTime,
          endTime: editEndTime,
          openHouseDate: editDate,
          propertyAddress: editAddress,
          mlsNumber: editMls,
          specialNotes: editNotes,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Update failed');
      if (data.lateChange) {
        toast({
          title: '⚠️ Change submitted after deadline',
          description: 'Your change was saved and staff has been notified, but the email blast may have already been sent. Staff will update MLS/Boomtown if possible.',
          variant: 'destructive',
        });
      } else {
        toast({ title: '✅ Open house updated', description: 'Staff has been notified of the change.' });
      }
      setEditSub(null);
      loadSubmissions();
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    } finally {
      setEditSaving(false);
    }
  }

  // ── Cancel ────────────────────────────────────────────────────────────────
  async function handleConfirmCancel() {
    if (!user || !cancelTarget) return;
    setCancelling(true);
    try {
      const tok = await user.getIdToken();
      const res = await fetch(`/api/agent/open-house-submissions?id=${cancelTarget.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ cancelReason }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Cancel failed');
      if (data.lateChange) {
        toast({
          title: '⚠️ Cancelled after deadline',
          description: 'Your open house was cancelled and staff has been notified. The email blast may have already gone out — staff will update MLS/Boomtown accordingly.',
          variant: 'destructive',
        });
      } else {
        toast({ title: '❌ Open house cancelled', description: 'Staff has been notified.' });
      }
      setCancelTarget(null);
      setCancelReason('');
      loadSubmissions();
    } catch (err: any) {
      toast({ title: 'Cancel failed', description: err.message, variant: 'destructive' });
    } finally {
      setCancelling(false);
    }
  }

  // ── Group submissions: this week vs past ──────────────────────────────────
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
  const nextWeekStart = addWeeks(weekStart, 1);
  const nextWeekEnd = addWeeks(weekStart, 2);

  const thisWeekSubs = submissions.filter(s => {
    const d = new Date(s.openHouseDate + 'T12:00:00');
    return d >= weekStart && d < nextWeekStart;
  });
  const nextWeekSubs = submissions.filter(s => {
    const d = new Date(s.openHouseDate + 'T12:00:00');
    return d >= nextWeekStart && d < nextWeekEnd;
  });
  const pastSubs = submissions.filter(s => {
    const d = new Date(s.openHouseDate + 'T12:00:00');
    return d < weekStart;
  });

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="h-8 w-8 p-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Home className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Submit Open House</h1>
        </div>
      </div>

      {/* Deadline Banner */}
      <div className={cn(
        'flex items-start gap-3 rounded-lg border p-4 mb-6',
        isAfterDeadline ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'
      )}>
        {isAfterDeadline ? <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" /> : <Info className="h-5 w-5 mt-0.5 shrink-0" />}
        <div>
          <p className="font-semibold text-sm">
            {isAfterDeadline ? '⚠️ Deadline has passed for this week' : `📅 Deadline: ${deadlineLabel}`}
          </p>
          <p className="text-xs mt-0.5">
            {isAfterDeadline
              ? 'The Thursday noon deadline has passed. You can still submit and staff will try to include it, but it may go out next week.'
              : 'Submit your open house by Thursday at noon to be included in the weekly email blast to all agents, clients, and leads.'}
          </p>
        </div>
      </div>

      {/* New Submission Button */}
      {!showForm && (
        <Button onClick={() => setShowForm(true)} className="w-full mb-6 gap-2">
          <Plus className="h-4 w-4" />
          Submit a New Open House
        </Button>
      )}

      {/* Submission Form */}
      {showForm && (
        <Card className="mb-6 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Home className="h-4 w-4 text-primary" />
              New Open House Submission
            </CardTitle>
            <CardDescription>
              Staff will pull the MLS details — just give us the key info below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="oh-date" className="flex items-center gap-1.5 text-xs font-medium">
                    <Calendar className="h-3.5 w-3.5" /> Open House Date *
                  </Label>
                  <Input id="oh-date" type="date" value={openHouseDate} onChange={e => setOpenHouseDate(e.target.value)} required min={format(now, 'yyyy-MM-dd')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="oh-start" className="flex items-center gap-1.5 text-xs font-medium">
                    <Clock className="h-3.5 w-3.5" /> Start Time *
                  </Label>
                  <Input id="oh-start" value={startTime} onChange={e => setStartTime(e.target.value)} placeholder="1:00 PM" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="oh-end" className="flex items-center gap-1.5 text-xs font-medium">
                    <Clock className="h-3.5 w-3.5" /> End Time *
                  </Label>
                  <Input id="oh-end" value={endTime} onChange={e => setEndTime(e.target.value)} placeholder="4:00 PM" required />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="oh-agent" className="text-xs font-medium">Your Name *</Label>
                  <Input id="oh-agent" value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="Your full name" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="oh-phone" className="flex items-center gap-1.5 text-xs font-medium">
                    <Phone className="h-3.5 w-3.5" /> Your Phone
                  </Label>
                  <Input id="oh-phone" type="tel" value={agentPhone} onChange={e => setAgentPhone(e.target.value)} placeholder="(337) 555-0100" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="oh-address" className="text-xs font-medium">Property Address</Label>
                  <Input id="oh-address" value={propertyAddress} onChange={e => setPropertyAddress(e.target.value)} placeholder="123 Main St, Lafayette, LA" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="oh-mls" className="text-xs font-medium">MLS Number</Label>
                  <Input id="oh-mls" value={mlsNumber} onChange={e => setMlsNumber(e.target.value)} placeholder="MLS123456" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="oh-notes" className="flex items-center gap-1.5 text-xs font-medium">
                  <FileText className="h-3.5 w-3.5" /> Special Highlights / Notes
                </Label>
                <Textarea id="oh-notes" value={specialNotes} onChange={e => setSpecialNotes(e.target.value)} placeholder="e.g. Giveaway!, Lunch provided, New roof, Pool, Great schools..." rows={3} className="resize-none" />
                <p className="text-[11px] text-muted-foreground">Staff will pull MLS details. Use this field for anything you want highlighted in the email.</p>
              </div>

              <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={submitting} className="flex-1">
                  {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</> : '🏠 Submit Open House'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)} disabled={submitting}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Submissions List */}
      <div className="space-y-6">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading your submissions...</div>
        ) : submissions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center">
              <Home className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No submissions yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Submit your first open house above.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* This week */}
            {thisWeekSubs.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">This Week</h2>
                <div className="space-y-3">{thisWeekSubs.map(sub => <SubmissionCard key={sub.id} sub={sub} onEdit={openEdit} onCancel={s => { setCancelTarget(s); setCancelReason(''); }} />)}</div>
              </div>
            )}
            {/* Next week */}
            {nextWeekSubs.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Next Week</h2>
                <div className="space-y-3">{nextWeekSubs.map(sub => <SubmissionCard key={sub.id} sub={sub} onEdit={openEdit} onCancel={s => { setCancelTarget(s); setCancelReason(''); }} />)}</div>
              </div>
            )}
            {/* Past */}
            {pastSubs.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Past Submissions</h2>
                <div className="space-y-3">{pastSubs.map(sub => <SubmissionCard key={sub.id} sub={sub} onEdit={openEdit} onCancel={s => { setCancelTarget(s); setCancelReason(''); }} />)}</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit Sheet */}
      <Sheet open={!!editSub} onOpenChange={v => { if (!v) setEditSub(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" /> Edit Open House
            </SheetTitle>
            <SheetDescription>
              Update the details below. Staff will be notified of any changes.
            </SheetDescription>
          </SheetHeader>

          {isAfterDeadline && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 mb-4 text-amber-800 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p><strong>You are past the Thursday noon deadline.</strong> Your change will be saved and staff will be notified, but the email blast may have already been sent. Staff will update MLS and Boomtown if possible.</p>
            </div>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Open House Date</Label>
                <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Start Time</Label>
                  <Input value={editStartTime} onChange={e => setEditStartTime(e.target.value)} placeholder="1:00 PM" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">End Time</Label>
                  <Input value={editEndTime} onChange={e => setEditEndTime(e.target.value)} placeholder="4:00 PM" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Property Address</Label>
                <Input value={editAddress} onChange={e => setEditAddress(e.target.value)} placeholder="123 Main St" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">MLS Number</Label>
                <Input value={editMls} onChange={e => setEditMls(e.target.value)} placeholder="MLS123456" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Special Notes</Label>
                <Textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3} className="resize-none" placeholder="Highlights, giveaways, etc." />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSaveEdit} disabled={editSaving} className="flex-1">
                {editSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : 'Save Changes'}
              </Button>
              <Button variant="outline" onClick={() => setEditSub(null)} disabled={editSaving}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={!!cancelTarget} onOpenChange={v => { if (!v) { setCancelTarget(null); setCancelReason(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <X className="h-5 w-5 text-red-500" />
              Cancel Open House
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {isAfterDeadline && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-800 text-xs">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <p><strong>You are past the Thursday noon deadline.</strong> The email blast may have already been sent. Staff will be notified and will update MLS and Boomtown accordingly.</p>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to cancel your open house on{' '}
                  <strong>{cancelTarget ? format(parseISO(cancelTarget.openHouseDate), 'EEEE, MMMM d') : ''}</strong>?
                  Staff will be notified.
                </p>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Reason for cancellation (optional)</Label>
                  <Textarea
                    value={cancelReason}
                    onChange={e => setCancelReason(e.target.value)}
                    placeholder="e.g. Property went under contract, schedule conflict..."
                    rows={2}
                    className="resize-none"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep It</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmCancel}
              disabled={cancelling}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {cancelling ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Cancelling...</> : 'Yes, Cancel Open House'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Submission Card ──────────────────────────────────────────────────────────
function SubmissionCard({
  sub,
  onEdit,
  onCancel,
}: {
  sub: Submission;
  onEdit: (s: Submission) => void;
  onCancel: (s: Submission) => void;
}) {
  const sc = STATUS_CONFIG[sub.status] ?? STATUS_CONFIG.pending;
  const checklist = sub.checklist;
  const isEditable = sub.status !== 'cancelled';

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Status + submitted date */}
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border', sc.color)}>
                {sc.icon} {sc.label}
              </span>
              <span className="text-xs text-muted-foreground">
                Submitted {format(new Date(sub.createdAt), 'MMM d, yyyy')}
              </span>
              {(sub.changeHistory?.length ?? 0) > 0 && (
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  edited {sub.changeHistory!.length}×
                </span>
              )}
            </div>

            {/* Date + time */}
            <div className="flex items-center gap-2 text-sm font-medium">
              <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
              {format(parseISO(sub.openHouseDate), 'EEEE, MMMM d, yyyy')}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              {sub.startTime} – {sub.endTime}
            </div>

            {/* Address */}
            {sub.propertyAddress && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                <Home className="h-3.5 w-3.5 shrink-0" />
                {sub.propertyAddress}
                {sub.mlsNumber && <span className="text-xs text-muted-foreground/70">· MLS# {sub.mlsNumber}</span>}
              </div>
            )}

            {/* Special notes */}
            {sub.specialNotes && (
              <div className="mt-2 text-xs bg-muted/50 rounded px-2 py-1.5 text-muted-foreground">
                💬 {sub.specialNotes}
              </div>
            )}

            {/* Cancel reason */}
            {sub.status === 'cancelled' && sub.cancelReason && (
              <div className="mt-2 text-xs bg-red-50 border border-red-200 rounded px-2 py-1.5 text-red-700">
                Reason: {sub.cancelReason}
              </div>
            )}

            {/* Staff checklist (read-only for agents) */}
            {sub.status === 'email_sent' && checklist && (
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <span className="text-[11px] font-medium text-muted-foreground">Staff completed:</span>
                <ChecklistBadge done={checklist.mls} label="MLS" />
                <ChecklistBadge done={checklist.boomtown} label="Boomtown" />
                <ChecklistBadge done={checklist.email} label="Email Blast" />
              </div>
            )}

            {/* Email sent confirmation */}
            {sub.status === 'email_sent' && sub.emailSentAt && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Completed {format(new Date(sub.emailSentAt), 'MMM d')} — your open house is live!
              </div>
            )}
          </div>

          {/* Actions */}
          {isEditable && (
            <div className="flex flex-col gap-1.5 shrink-0">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onEdit(sub)}>
                <Pencil className="h-3 w-3" /> Edit
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50" onClick={() => onCancel(sub)}>
                <X className="h-3 w-3" /> Cancel
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ChecklistBadge({ done, label }: { done: boolean; label: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border',
      done ? 'bg-green-100 text-green-800 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'
    )}>
      {done ? '✓' : '○'} {label}
    </span>
  );
}
