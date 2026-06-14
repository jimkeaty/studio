'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { format, addDays, nextThursday, isBefore, parseISO } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  Home, Clock, Calendar, Phone, FileText, CheckCircle2,
  AlertCircle, Plus, Loader2, ArrowLeft, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Submission = {
  id: string;
  agentName: string;
  propertyAddress?: string;
  openHouseDate: string;
  startTime: string;
  endTime: string;
  specialNotes?: string;
  status: 'pending' | 'email_sent' | 'cancelled';
  createdAt: string;
  emailSentAt?: string;
};

const STATUS_CONFIG = {
  pending: { label: 'Pending Review', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: '⏳' },
  email_sent: { label: 'Email Sent ✓', color: 'bg-green-100 text-green-800 border-green-200', icon: '✅' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800 border-red-200', icon: '❌' },
};

export default function OpenHouseSubmissionPage() {
  const { user } = useUser();
  const router = useRouter();
  const { toast } = useToast();

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [openHouseDate, setOpenHouseDate] = useState('');
  const [startTime, setStartTime] = useState('1:00 PM');
  const [endTime, setEndTime] = useState('4:00 PM');
  const [agentName, setAgentName] = useState('');
  const [agentPhone, setAgentPhone] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [mlsNumber, setMlsNumber] = useState('');
  const [specialNotes, setSpecialNotes] = useState('');

  // Deadline info
  const now = new Date();
  const thisThursday = nextThursday(now);
  const deadlineLabel = format(thisThursday, 'EEEE, MMMM d') + ' at noon';
  const isAfterDeadline = now.getDay() === 4 && now.getHours() >= 12; // Thursday after noon

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
      // Pre-fill agent name from display name
      setAgentName(user.displayName || '');
    }
  }, [user]);

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
      // Reset form
      setOpenHouseDate('');
      setStartTime('1:00 PM');
      setEndTime('4:00 PM');
      setPropertyAddress('');
      setMlsNumber('');
      setSpecialNotes('');
      loadSubmissions();
    } catch (err: any) {
      toast({ title: 'Submission failed', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

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
        isAfterDeadline
          ? 'bg-red-50 border-red-200 text-red-800'
          : 'bg-amber-50 border-amber-200 text-amber-800'
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
              {/* Date + Times */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="oh-date" className="flex items-center gap-1.5 text-xs font-medium">
                    <Calendar className="h-3.5 w-3.5" /> Open House Date *
                  </Label>
                  <Input
                    id="oh-date"
                    type="date"
                    value={openHouseDate}
                    onChange={e => setOpenHouseDate(e.target.value)}
                    required
                    min={format(now, 'yyyy-MM-dd')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="oh-start" className="flex items-center gap-1.5 text-xs font-medium">
                    <Clock className="h-3.5 w-3.5" /> Start Time *
                  </Label>
                  <Input
                    id="oh-start"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    placeholder="1:00 PM"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="oh-end" className="flex items-center gap-1.5 text-xs font-medium">
                    <Clock className="h-3.5 w-3.5" /> End Time *
                  </Label>
                  <Input
                    id="oh-end"
                    value={endTime}
                    onChange={e => setEndTime(e.target.value)}
                    placeholder="4:00 PM"
                    required
                  />
                </div>
              </div>

              {/* Agent Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="oh-agent" className="text-xs font-medium">Your Name *</Label>
                  <Input
                    id="oh-agent"
                    value={agentName}
                    onChange={e => setAgentName(e.target.value)}
                    placeholder="Your full name"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="oh-phone" className="flex items-center gap-1.5 text-xs font-medium">
                    <Phone className="h-3.5 w-3.5" /> Your Phone
                  </Label>
                  <Input
                    id="oh-phone"
                    type="tel"
                    value={agentPhone}
                    onChange={e => setAgentPhone(e.target.value)}
                    placeholder="(337) 555-0100"
                  />
                </div>
              </div>

              {/* Property */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="oh-address" className="text-xs font-medium">Property Address</Label>
                  <Input
                    id="oh-address"
                    value={propertyAddress}
                    onChange={e => setPropertyAddress(e.target.value)}
                    placeholder="123 Main St, Lafayette, LA"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="oh-mls" className="text-xs font-medium">MLS # (optional)</Label>
                  <Input
                    id="oh-mls"
                    value={mlsNumber}
                    onChange={e => setMlsNumber(e.target.value)}
                    placeholder="MLS123456"
                  />
                </div>
              </div>

              {/* Special Notes */}
              <div className="space-y-1.5">
                <Label htmlFor="oh-notes" className="flex items-center gap-1.5 text-xs font-medium">
                  <FileText className="h-3.5 w-3.5" /> Special Highlights / Notes
                </Label>
                <Textarea
                  id="oh-notes"
                  value={specialNotes}
                  onChange={e => setSpecialNotes(e.target.value)}
                  placeholder="e.g. Giveaway!, Lunch provided, New roof, Pool, Great schools..."
                  rows={3}
                  className="resize-none"
                />
                <p className="text-[11px] text-muted-foreground">
                  Staff will pull MLS details. Use this field for anything you want highlighted in the email.
                </p>
              </div>

              <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={submitting} className="flex-1">
                  {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</> : '🏠 Submit Open House'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)} disabled={submitting}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* My Submissions */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">My Submissions</h2>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
        ) : submissions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center">
              <Home className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No submissions yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Submit your first open house above.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {submissions.map(sub => {
              const sc = STATUS_CONFIG[sub.status] ?? STATUS_CONFIG.pending;
              return (
                <Card key={sub.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border', sc.color)}>
                            {sc.icon} {sc.label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Submitted {format(new Date(sub.createdAt), 'MMM d, yyyy')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm font-medium mt-1">
                          <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                          {format(parseISO(sub.openHouseDate), 'EEEE, MMMM d, yyyy')}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          {sub.startTime} – {sub.endTime}
                        </div>
                        {sub.propertyAddress && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                            <Home className="h-3.5 w-3.5 shrink-0" />
                            {sub.propertyAddress}
                          </div>
                        )}
                        {sub.specialNotes && (
                          <div className="mt-2 text-xs bg-muted/50 rounded px-2 py-1.5 text-muted-foreground">
                            💬 {sub.specialNotes}
                          </div>
                        )}
                        {sub.status === 'email_sent' && sub.emailSentAt && (
                          <div className="mt-2 flex items-center gap-1.5 text-xs text-green-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Email blast sent {format(new Date(sub.emailSentAt), 'MMM d')} — your open house is live!
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
