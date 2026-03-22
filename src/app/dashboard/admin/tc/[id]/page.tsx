'use client';

import { useEffect, useState, use } from 'react';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, CheckCircle2, XCircle, Eye, Save, AlertTriangle, ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

// ─────────────────────────────────────────────────────────────────────────────
// Form schema (mirrors submit form)
// ─────────────────────────────────────────────────────────────────────────────
const schema = z.object({
  closingType: z.enum(['buyer', 'listing', 'referral']),
  dealType: z.enum(['residential_sale', 'residential_lease', 'land', 'commercial_sale', 'commercial_lease']),
  address: z.string().min(5),
  clientName: z.string().min(1),
  dealSource: z.string().optional(),
  listPrice: z.coerce.number().min(0).optional().or(z.literal('')),
  salePrice: z.coerce.number().min(0).optional().or(z.literal('')),
  commissionPercent: z.coerce.number().min(0).max(100).optional().or(z.literal('')),
  gci: z.coerce.number().min(0).optional().or(z.literal('')),
  transactionFee: z.coerce.number().min(0).optional().or(z.literal('')),
  earnestMoney: z.coerce.number().min(0).optional().or(z.literal('')),
  brokerPct: z.coerce.number().min(0).max(100).optional().or(z.literal('')),
  brokerGci: z.coerce.number().min(0).optional().or(z.literal('')),
  agentPct: z.coerce.number().min(0).max(100).optional().or(z.literal('')),
  agentDollar: z.coerce.number().min(0).optional().or(z.literal('')),
  listingDate: z.string().optional().or(z.literal('')),
  contractDate: z.string().optional().or(z.literal('')),
  optionExpiration: z.string().optional().or(z.literal('')),
  inspectionDeadline: z.string().optional().or(z.literal('')),
  surveyDeadline: z.string().optional().or(z.literal('')),
  projectedCloseDate: z.string().optional().or(z.literal('')),
  closedDate: z.string().optional().or(z.literal('')),
  mortgageCompany: z.string().optional(),
  loanOfficer: z.string().optional(),
  titleCompany: z.string().optional(),
  titleOfficer: z.string().optional(),
  otherAgentName: z.string().optional(),
  otherBrokerage: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const SOURCES = [
  { value: 'boomtown', label: 'Boomtown' },
  { value: 'referral', label: 'Referral' },
  { value: 'sphere', label: 'Sphere of Influence' },
  { value: 'sign_call', label: 'Sign Call' },
  { value: 'company_gen', label: 'Company Generated' },
  { value: 'social', label: 'Social Media' },
  { value: 'open_house', label: 'Open House' },
  { value: 'fsbo', label: 'FSBO' },
  { value: 'expired_listing', label: 'Expired Listing' },
  { value: 'other', label: 'Other' },
];

function formatDate(s?: string | null) {
  if (!s) return '—';
  try { return format(parseISO(s), 'MMM d, yyyy h:mm a'); } catch { return s; }
}

function Dl({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium mt-0.5">{value || '—'}</dd>
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-5">{children}</div>;
}

function Grid3({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-3 gap-5">{children}</div>;
}

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}</CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}

const STATUS_BADGE: Record<string, string> = {
  submitted: 'bg-blue-500/80 text-white',
  in_review: 'bg-yellow-500/80 text-white',
  approved: 'bg-green-600/80 text-white',
  rejected: 'bg-red-500/80 text-white',
};

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function TcReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading: userLoading } = useUser();
  const router = useRouter();
  const { toast } = useToast();

  const [intake, setIntake] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  // ── Load intake ──────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/tc/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load');
        setIntake(data.intake);

        // Populate form
        const i = data.intake;
        form.reset({
          closingType: i.closingType || 'buyer',
          dealType: i.dealType || 'residential_sale',
          address: i.address || '',
          clientName: i.clientName || '',
          dealSource: i.dealSource || '',
          listPrice: i.listPrice ?? '',
          salePrice: i.salePrice ?? '',
          commissionPercent: i.commissionPercent ?? '',
          gci: i.gci ?? '',
          transactionFee: i.transactionFee ?? '',
          earnestMoney: i.earnestMoney ?? '',
          brokerPct: i.brokerPct ?? '',
          brokerGci: i.brokerGci ?? '',
          agentPct: i.agentPct ?? '',
          agentDollar: i.agentDollar ?? '',
          listingDate: i.listingDate || '',
          contractDate: i.contractDate || '',
          optionExpiration: i.optionExpiration || '',
          inspectionDeadline: i.inspectionDeadline || '',
          surveyDeadline: i.surveyDeadline || '',
          projectedCloseDate: i.projectedCloseDate || '',
          closedDate: i.closedDate || '',
          mortgageCompany: i.mortgageCompany || '',
          loanOfficer: i.loanOfficer || '',
          titleCompany: i.titleCompany || '',
          titleOfficer: i.titleOfficer || '',
          otherAgentName: i.otherAgentName || '',
          otherBrokerage: i.otherBrokerage || '',
          notes: i.notes || '',
        });
      } catch (err: any) {
        toast({ title: 'Error', description: err.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    if (!userLoading && user) load();
  }, [user, userLoading, id]);

  const callAction = async (action: string, extra?: Record<string, any>) => {
    if (!user) return;
    setActing(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/tc/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Action failed');
      return data;
    } finally {
      setActing(false);
    }
  };

  const handleSave = async (values: FormValues) => {
    setSaving(true);
    try {
      const token = await user!.getIdToken();
      const res = await fetch(`/api/admin/tc/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'update', ...values }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Save failed');
      toast({ title: 'Changes Saved', description: 'Intake updated successfully.' });
      setIntake((prev: any) => ({ ...prev, ...values }));
    } catch (err: any) {
      toast({ title: 'Save Failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleMarkInReview = async () => {
    try {
      await callAction('in_review');
      toast({ title: 'Marked In Review' });
      setIntake((prev: any) => ({ ...prev, status: 'in_review' }));
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleApprove = async () => {
    try {
      const result = await callAction('approve');
      toast({
        title: '✅ Transaction Approved!',
        description: `Transaction ID: ${result.transactionId}`,
      });
      setIntake((prev: any) => ({ ...prev, status: 'approved', approvedTransactionId: result.transactionId }));
    } catch (err: any) {
      toast({ title: 'Approval Failed', description: err.message, variant: 'destructive' });
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast({ title: 'Reason required', description: 'Please enter a rejection reason.', variant: 'destructive' });
      return;
    }
    try {
      await callAction('reject', { rejectionReason: rejectReason });
      toast({ title: 'Intake Rejected', description: rejectReason });
      setIntake((prev: any) => ({ ...prev, status: 'rejected', rejectionReason: rejectReason }));
      setRejectOpen(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  // ── Guards ───────────────────────────────────────────────────────────────
  if (userLoading || loading) {
    return <div className="space-y-4"><Skeleton className="h-12 w-1/3" /><Skeleton className="h-96 w-full" /></div>;
  }
  if (!user || user.uid !== ADMIN_UID) {
    return <Alert variant="destructive"><AlertTitle>Access Denied</AlertTitle></Alert>;
  }
  if (!intake) {
    return <Alert><AlertTitle>Not Found</AlertTitle><AlertDescription>Intake not found.</AlertDescription></Alert>;
  }

  const isReadOnly = intake.status === 'approved' || intake.status === 'rejected';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Link href="/dashboard/admin/tc" className="hover:underline flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> TC Queue
          </Link>
          <span>/</span>
          <span className="font-mono text-xs">{id.slice(0, 8)}…</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{intake.address}</h1>
            <p className="text-muted-foreground">{intake.agentDisplayName} · {intake.clientName}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={cn('text-sm px-3 py-1', STATUS_BADGE[intake.status] || 'bg-muted text-foreground')}>
              {intake.status?.replace('_', ' ').toUpperCase()}
            </Badge>
          </div>
        </div>
      </div>

      {/* Meta info row */}
      <Card>
        <CardContent className="pt-4">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Dl label="Submitted" value={formatDate(intake.submittedAt)} />
            <Dl label="Last Updated" value={formatDate(intake.updatedAt)} />
            <Dl label="Submitted By" value={intake.submittedByEmail} />
            {intake.approvedTransactionId && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Transaction</dt>
                <dd className="text-sm font-medium mt-0.5">
                  <Link href="/dashboard/admin/transactions" className="text-primary flex items-center gap-1 hover:underline">
                    View Ledger <ExternalLink className="h-3 w-3" />
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Rejection notice */}
      {intake.status === 'rejected' && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Rejected</AlertTitle>
          <AlertDescription>{intake.rejectionReason}</AlertDescription>
        </Alert>
      )}

      {/* Approved notice */}
      {intake.status === 'approved' && (
        <Alert className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-700 dark:text-green-400">Approved</AlertTitle>
          <AlertDescription>
            This TC was approved and added to the Transaction Ledger.
            {intake.approvedTransactionId && (
              <span className="block font-mono text-xs mt-1">TX: {intake.approvedTransactionId}</span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* ── Action buttons (top, for quick action before reviewing) ──────── */}
      {!isReadOnly && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-medium text-muted-foreground mr-2">Quick Actions:</p>
              {intake.status === 'submitted' && (
                <Button variant="outline" size="sm" onClick={handleMarkInReview} disabled={acting}>
                  <Eye className="mr-2 h-4 w-4" /> Mark In Review
                </Button>
              )}
              <Button size="sm" onClick={form.handleSubmit(handleApprove)} disabled={acting} className="bg-green-600 hover:bg-green-700 text-white">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {acting ? 'Processing…' : 'Approve → Create Transaction'}
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setRejectOpen(true)} disabled={acting}>
                <XCircle className="mr-2 h-4 w-4" /> Reject
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Approving will create a live transaction in the ledger based on the data below.
              Save any edits first.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Editable form ─────────────────────────────────────────────────── */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSave)} className="space-y-6">

          {/* Section 1: Transaction Basics */}
          <SectionCard title="Transaction Basics">
            <Grid2>
              <FormField control={form.control} name="closingType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Type of Closing</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={isReadOnly}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="buyer">Buyer</SelectItem>
                      <SelectItem value="listing">Listing</SelectItem>
                      <SelectItem value="referral">Referral</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="dealType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Deal Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={isReadOnly}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="residential_sale">Residential Sale</SelectItem>
                      <SelectItem value="residential_lease">Residential Lease</SelectItem>
                      <SelectItem value="land">Land</SelectItem>
                      <SelectItem value="commercial_sale">Commercial Sale</SelectItem>
                      <SelectItem value="commercial_lease">Commercial Lease</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </Grid2>
            <FormField control={form.control} name="address" render={({ field }) => (
              <FormItem>
                <FormLabel>Address</FormLabel>
                <FormControl><Input {...field} disabled={isReadOnly} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <Grid2>
              <FormField control={form.control} name="clientName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Client Name</FormLabel>
                  <FormControl><Input {...field} disabled={isReadOnly} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="dealSource" render={({ field }) => (
                <FormItem>
                  <FormLabel>Lead Source</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={isReadOnly}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </Grid2>
          </SectionCard>

          {/* Section 2: Key Dates */}
          <SectionCard title="Key Dates">
            <Grid3>
              {[
                { name: 'listingDate' as const, label: 'Listing Date' },
                { name: 'contractDate' as const, label: 'Under Contract Date' },
                { name: 'optionExpiration' as const, label: 'Option Expiration' },
              ].map(({ name, label }) => (
                <FormField key={name} control={form.control} name={name} render={({ field }) => (
                  <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <FormControl><Input type="date" {...field} disabled={isReadOnly} /></FormControl>
                  </FormItem>
                )} />
              ))}
            </Grid3>
            <Grid3>
              {[
                { name: 'inspectionDeadline' as const, label: 'Inspection Deadline' },
                { name: 'surveyDeadline' as const, label: 'Survey Deadline' },
                { name: 'projectedCloseDate' as const, label: 'Projected Close Date' },
              ].map(({ name, label }) => (
                <FormField key={name} control={form.control} name={name} render={({ field }) => (
                  <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <FormControl><Input type="date" {...field} disabled={isReadOnly} /></FormControl>
                  </FormItem>
                )} />
              ))}
            </Grid3>
            <div className="max-w-xs">
              <FormField control={form.control} name="closedDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Actual Close Date</FormLabel>
                  <FormControl><Input type="date" {...field} disabled={isReadOnly} /></FormControl>
                  <FormDescription>Setting this marks the transaction as "closed" on approval.</FormDescription>
                </FormItem>
              )} />
            </div>
          </SectionCard>

          {/* Section 3: Financial */}
          <SectionCard title="Financial Details">
            <Grid2>
              <FormField control={form.control} name="listPrice" render={({ field }) => (
                <FormItem><FormLabel>List Price ($)</FormLabel><FormControl><Input type="number" step="1" {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="salePrice" render={({ field }) => (
                <FormItem><FormLabel>Sale Price ($)</FormLabel><FormControl><Input type="number" step="1" {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
            </Grid2>
            <Grid3>
              <FormField control={form.control} name="commissionPercent" render={({ field }) => (
                <FormItem><FormLabel>Commission %</FormLabel><FormControl><Input type="number" step="0.01" {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="gci" render={({ field }) => (
                <FormItem><FormLabel>GCI ($)</FormLabel><FormControl><Input type="number" step="0.01" {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="transactionFee" render={({ field }) => (
                <FormItem><FormLabel>Transaction Fee ($)</FormLabel><FormControl><Input type="number" step="0.01" {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
            </Grid3>
            <Separator />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Commission Split</p>
            <Grid2>
              <FormField control={form.control} name="brokerPct" render={({ field }) => (
                <FormItem><FormLabel>Broker %</FormLabel><FormControl><Input type="number" step="0.01" {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="brokerGci" render={({ field }) => (
                <FormItem><FormLabel>Broker GCI ($)</FormLabel><FormControl><Input type="number" step="0.01" {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="agentPct" render={({ field }) => (
                <FormItem><FormLabel>Agent %</FormLabel><FormControl><Input type="number" step="0.01" {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="agentDollar" render={({ field }) => (
                <FormItem>
                  <FormLabel>Agent Net $ (Primary GCI)</FormLabel>
                  <FormControl><Input type="number" step="0.01" {...field} disabled={isReadOnly} /></FormControl>
                  <FormDescription>If filled, overrides split calculation on approval.</FormDescription>
                </FormItem>
              )} />
            </Grid2>
            <div className="max-w-xs">
              <FormField control={form.control} name="earnestMoney" render={({ field }) => (
                <FormItem><FormLabel>Earnest Money ($)</FormLabel><FormControl><Input type="number" step="1" {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
            </div>
          </SectionCard>

          {/* Section 4: Parties */}
          <SectionCard title="Transaction Parties">
            <Grid2>
              {[
                { name: 'mortgageCompany' as const, label: 'Mortgage Company', placeholder: 'First Federal Bank' },
                { name: 'loanOfficer' as const, label: 'Loan Officer', placeholder: '' },
                { name: 'titleCompany' as const, label: 'Title Company', placeholder: 'Acadian Title' },
                { name: 'titleOfficer' as const, label: 'Title Officer', placeholder: '' },
                { name: 'otherAgentName' as const, label: 'Other Agent Name', placeholder: '' },
                { name: 'otherBrokerage' as const, label: 'Other Brokerage', placeholder: '' },
              ].map(({ name, label, placeholder }) => (
                <FormField key={name} control={form.control} name={name} render={({ field }) => (
                  <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <FormControl><Input placeholder={placeholder} {...field} disabled={isReadOnly} /></FormControl>
                  </FormItem>
                )} />
              ))}
            </Grid2>
          </SectionCard>

          {/* Section 5: Notes */}
          <SectionCard title="Notes">
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Textarea className="min-h-[100px]" {...field} disabled={isReadOnly} />
                </FormControl>
              </FormItem>
            )} />
          </SectionCard>

          {/* Save / action buttons (bottom) */}
          {!isReadOnly && (
            <div className="flex flex-wrap items-center gap-3 pb-8">
              <Button type="submit" disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'Saving…' : 'Save Changes'}
              </Button>
              <Button
                type="button"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={form.handleSubmit(handleApprove)}
                disabled={acting}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {acting ? 'Approving…' : 'Approve → Create Transaction'}
              </Button>
              <Button type="button" variant="destructive" onClick={() => setRejectOpen(true)} disabled={acting}>
                <XCircle className="mr-2 h-4 w-4" /> Reject
              </Button>
            </div>
          )}
        </form>
      </Form>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject TC Submission</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this submission. The agent will see this note.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="e.g. Missing contract date, GCI doesn't match commission structure..."
            className="min-h-[100px]"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={acting}>
              <XCircle className="mr-2 h-4 w-4" /> Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
