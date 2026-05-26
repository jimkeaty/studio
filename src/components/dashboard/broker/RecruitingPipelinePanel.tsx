'use client';
// RecruitingPipelinePanel — CRUD panel for managing recruiting pipeline candidates.
// Embedded in the Recruiting & Development page.
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { UserPlus, Pencil, Trash2, TrendingUp } from 'lucide-react';
import { useUser } from '@/firebase';

const STATUSES = [
  { value: 'prospect',        label: 'Prospect',         color: 'bg-slate-100 text-slate-700' },
  { value: 'engaged',         label: 'Engaged',          color: 'bg-blue-100 text-blue-700' },
  { value: 'interview_set',   label: 'Interview Set',    color: 'bg-yellow-100 text-yellow-700' },
  { value: 'interview_held',  label: 'Interview Held',   color: 'bg-orange-100 text-orange-700' },
  { value: 'offer_extended',  label: 'Offer Extended',   color: 'bg-purple-100 text-purple-700' },
  { value: 'offer_accepted',  label: 'Offer Accepted',   color: 'bg-green-100 text-green-700' },
  { value: 'scheduled_start', label: 'Scheduled Start',  color: 'bg-emerald-100 text-emerald-700' },
  { value: 'declined',        label: 'Declined',         color: 'bg-red-100 text-red-700' },
];

const EMPTY_FORM = {
  name: '', source: '', recruiter: '', status: 'prospect',
  expectedStartDate: '', phone: '', email: '', currentBrokerage: '', notes: '',
};

type Candidate = typeof EMPTY_FORM & { id: string; createdAt?: string };

function StatusBadge({ status }: { status: string }) {
  const s = STATUSES.find(x => x.value === status);
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s?.color ?? 'bg-gray-100 text-gray-700'}`}>
      {s?.label ?? status}
    </span>
  );
}

export function RecruitingPipelinePanel() {
  const { user } = useUser();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const getToken = useCallback(async () => {
    if (!user) throw new Error('Not authenticated');
    return user.getIdToken();
  }, [user]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/broker/recruiting-pipeline', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load');
      const data = await res.json();
      setCandidates(data.candidates || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { if (user) load(); }, [load, user]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEdit = (c: Candidate) => {
    setEditing(c);
    setForm({
      name: c.name || '',
      source: c.source || '',
      recruiter: c.recruiter || '',
      status: c.status || 'prospect',
      expectedStartDate: c.expectedStartDate || '',
      phone: c.phone || '',
      email: c.email || '',
      currentBrokerage: c.currentBrokerage || '',
      notes: c.notes || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const token = await getToken();
      if (editing) {
        await fetch('/api/broker/recruiting-pipeline', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: editing.id, ...form }),
        });
      } else {
        await fetch('/api/broker/recruiting-pipeline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(form),
        });
      }
      setDialogOpen(false);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const token = await getToken();
      await fetch(`/api/broker/recruiting-pipeline?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleteId(null);
    }
  };

  const fld = (k: keyof typeof EMPTY_FORM, v: string) => setForm(p => ({ ...p, [k]: v }));

  // Group by status for summary
  const statusCounts = STATUSES.map(s => ({
    ...s,
    count: candidates.filter(c => c.status === s.value).length,
  })).filter(s => s.count > 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Recruiting Pipeline
            </CardTitle>
            <CardDescription>
              Track candidates from prospect to scheduled start — feeds the projection line on the Active Agents chart
            </CardDescription>
          </div>
          <Button size="sm" onClick={openAdd}>
            <UserPlus className="h-4 w-4 mr-2" />
            Add Candidate
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status summary badges */}
        {statusCounts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {statusCounts.map(s => (
              <span key={s.value} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${s.color}`}>
                {s.label} <span className="font-bold">{s.count}</span>
              </span>
            ))}
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : candidates.length === 0 ? (
          <div className="text-center text-muted-foreground py-12 text-sm">
            No pipeline candidates yet. Click &quot;Add Candidate&quot; to start tracking recruits.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expected Start</TableHead>
                  <TableHead>Current Brokerage</TableHead>
                  <TableHead>Source / Recruiter</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map(c => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">{c.name}</div>
                      {c.email && <div className="text-xs text-muted-foreground">{c.email}</div>}
                      {c.phone && <div className="text-xs text-muted-foreground">{c.phone}</div>}
                    </TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                    <TableCell>
                      {c.expectedStartDate
                        ? new Date(c.expectedStartDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : <span className="text-muted-foreground text-xs">Not set</span>}
                    </TableCell>
                    <TableCell>{c.currentBrokerage || <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                    <TableCell>
                      {c.source && <div className="text-sm">{c.source}</div>}
                      {c.recruiter && <div className="text-xs text-muted-foreground">{c.recruiter}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(c.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Candidate' : 'Add Pipeline Candidate'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Full Name *</Label>
                <Input value={form.name} onChange={e => fld('name', e.target.value)} placeholder="Jane Smith" />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => fld('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Expected Start Date</Label>
                <Input type="date" value={form.expectedStartDate} onChange={e => fld('expectedStartDate', e.target.value)} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={e => fld('phone', e.target.value)} placeholder="(555) 000-0000" />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={e => fld('email', e.target.value)} placeholder="jane@example.com" />
              </div>
              <div>
                <Label>Current Brokerage</Label>
                <Input value={form.currentBrokerage} onChange={e => fld('currentBrokerage', e.target.value)} placeholder="Keller Williams" />
              </div>
              <div>
                <Label>Source</Label>
                <Input value={form.source} onChange={e => fld('source', e.target.value)} placeholder="Referral, LinkedIn…" />
              </div>
              <div className="col-span-2">
                <Label>Recruiter / Assigned To</Label>
                <Input value={form.recruiter} onChange={e => fld('recruiter', e.target.value)} placeholder="Agent or staff name" />
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={e => fld('notes', e.target.value)}
                  placeholder="Any relevant notes…"
                  rows={3}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Candidate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Candidate?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently remove this candidate from the pipeline. This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
