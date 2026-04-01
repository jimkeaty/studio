'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, use, useCallback } from 'react';
import { useUser } from '@/firebase';
import { useIsStaff } from '@/hooks/useIsStaff';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, CheckCircle2, XCircle, Eye, Save, AlertTriangle, ExternalLink,
  ClipboardList, UserCheck, Clock, Activity, Archive, Trash2, DollarSign,
  Phone, Mail, Building2, User, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CANONICAL_SOURCES } from '@/lib/normalizeDealSource';

const SOURCES = CANONICAL_SOURCES;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type ChecklistItem = {
  id: string;
  order: number;
  label: string;
  completed: boolean;
  completedBy: string | null;
  completedAt: string | null;
};

type TcProfile = {
  id: string;
  displayName: string;
  email: string;
  role?: string;
  status: 'active' | 'inactive';
};

type ActivityEntry = {
  timestamp: string;
  action: string;
  detail: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Form schema — full field set matching Add Transaction
// ─────────────────────────────────────────────────────────────────────────────
const schema = z.object({
  // Core
  closingType: z.enum(['buyer', 'listing', 'referral', 'dual']),
  dealType: z.enum(['residential_sale', 'residential_lease', 'land', 'commercial_sale', 'commercial_lease']),
  address: z.string().min(5),
  clientName: z.string().min(1),
  dealSource: z.string().optional(),

  // Financial
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

  // Dates
  listingDate: z.string().optional().or(z.literal('')),
  contractDate: z.string().optional().or(z.literal('')),
  optionExpiration: z.string().optional().or(z.literal('')),
  inspectionDeadline: z.string().optional().or(z.literal('')),
  surveyDeadline: z.string().optional().or(z.literal('')),
  projectedCloseDate: z.string().optional().or(z.literal('')),
  closedDate: z.string().optional().or(z.literal('')),
  loanApplicationDeadline: z.string().optional().or(z.literal('')),
  appraisalDeadline: z.string().optional().or(z.literal('')),
  titleDeadline: z.string().optional().or(z.literal('')),
  finalLoanCommitmentDeadline: z.string().optional().or(z.literal('')),

  // Client contact
  clientEmail: z.string().optional().or(z.literal('')),
  clientPhone: z.string().optional(),
  clientNewAddress: z.string().optional(),
  client2Name: z.string().optional(),
  client2Email: z.string().optional().or(z.literal('')),
  client2Phone: z.string().optional(),

  // Buyer contact
  buyerName: z.string().optional(),
  buyerEmail: z.string().optional().or(z.literal('')),
  buyerPhone: z.string().optional(),
  buyer2Name: z.string().optional(),
  buyer2Email: z.string().optional().or(z.literal('')),
  buyer2Phone: z.string().optional(),

  // Seller contact
  sellerName: z.string().optional(),
  sellerEmail: z.string().optional().or(z.literal('')),
  sellerPhone: z.string().optional(),
  seller2Name: z.string().optional(),
  seller2Email: z.string().optional().or(z.literal('')),
  seller2Phone: z.string().optional(),

  // Other agent
  otherAgentName: z.string().optional(),
  otherAgentEmail: z.string().optional().or(z.literal('')),
  otherAgentPhone: z.string().optional(),
  otherBrokerage: z.string().optional(),

  // Lender
  mortgageCompany: z.string().optional(),
  loanOfficer: z.string().optional(),
  loanOfficerEmail: z.string().optional().or(z.literal('')),
  loanOfficerPhone: z.string().optional(),
  lenderOffice: z.string().optional(),

  // Title
  titleCompany: z.string().optional(),
  titleOfficer: z.string().optional(),
  titleOfficerEmail: z.string().optional().or(z.literal('')),
  titleOfficerPhone: z.string().optional(),
  titleAttorney: z.string().optional(),
  titleOffice: z.string().optional(),

  // Notes
  notes: z.string().optional(),
  additionalComments: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function formatDateFull(s?: string | null) {
  if (!s) return '—';
  try { return format(parseISO(s), 'MMM d, yyyy h:mm a'); } catch { return s; }
}

function formatDateShort(s?: string | null) {
  if (!s) return '—';
  try { return format(parseISO(s), 'MMM d, yyyy'); } catch { return s; }
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

function SectionCard({ title, description, icon, children }: {
  title: string; description?: string; icon?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {icon}{title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}

function ContactRow({ label, name, email, phone }: {
  label: string; name?: string | null; email?: string | null; phone?: string | null;
}) {
  if (!name && !email && !phone) return null;
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      {name && <p className="text-sm font-medium">{name}</p>}
      {email && (
        <p className="text-sm text-muted-foreground flex items-center gap-1">
          <Mail className="h-3 w-3" />
          <a href={`mailto:${email}`} className="hover:underline text-primary">{email}</a>
        </p>
      )}
      {phone && (
        <p className="text-sm text-muted-foreground flex items-center gap-1">
          <Phone className="h-3 w-3" />
          <a href={`tel:${phone}`} className="hover:underline">{phone}</a>
        </p>
      )}
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  submitted: 'bg-blue-500/80 text-white',
  in_review: 'bg-yellow-500/80 text-white',
  approved: 'bg-green-600/80 text-white',
  rejected: 'bg-red-500/80 text-white',
  archived: 'bg-gray-500/80 text-white',
};

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function TcReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading: userLoading } = useUser();
  const { isStaff, isAdmin, role: staffRole, loading: adminLoading } = useIsStaff();
  const router = useRouter();
  const { toast } = useToast();

  const [intake, setIntake] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [removeOpen, setRemoveOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideValues, setOverrideValues] = useState({ brokerPct: '', agentPct: '', agentDollar: '', gci: '' });

  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [tcProfiles, setTcProfiles] = useState<TcProfile[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);

  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  const getToken = useCallback(async () => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);

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
          loanApplicationDeadline: i.loanApplicationDeadline || '',
          appraisalDeadline: i.appraisalDeadline || '',
          titleDeadline: i.titleDeadline || '',
          finalLoanCommitmentDeadline: i.finalLoanCommitmentDeadline || '',
          clientEmail: i.clientEmail || '',
          clientPhone: i.clientPhone || '',
          clientNewAddress: i.clientNewAddress || '',
          client2Name: i.client2Name || '',
          client2Email: i.client2Email || '',
          client2Phone: i.client2Phone || '',
          buyerName: i.buyerName || '',
          buyerEmail: i.buyerEmail || '',
          buyerPhone: i.buyerPhone || '',
          buyer2Name: i.buyer2Name || '',
          buyer2Email: i.buyer2Email || '',
          buyer2Phone: i.buyer2Phone || '',
          sellerName: i.sellerName || '',
          sellerEmail: i.sellerEmail || '',
          sellerPhone: i.sellerPhone || '',
          seller2Name: i.seller2Name || '',
          seller2Email: i.seller2Email || '',
          seller2Phone: i.seller2Phone || '',
          otherAgentName: i.otherAgentName || '',
          otherAgentEmail: i.otherAgentEmail || '',
          otherAgentPhone: i.otherAgentPhone || '',
          otherBrokerage: i.otherBrokerage || '',
          mortgageCompany: i.mortgageCompany || '',
          loanOfficer: i.loanOfficer || '',
          loanOfficerEmail: i.loanOfficerEmail || '',
          loanOfficerPhone: i.loanOfficerPhone || '',
          lenderOffice: i.lenderOffice || '',
          titleCompany: i.titleCompany || '',
          titleOfficer: i.titleOfficer || '',
          titleOfficerEmail: i.titleOfficerEmail || '',
          titleOfficerPhone: i.titleOfficerPhone || '',
          titleAttorney: i.titleAttorney || '',
          titleOffice: i.titleOffice || '',
          notes: i.notes || '',
          additionalComments: i.additionalComments || '',
        });

        if (data.checklist) setChecklist(data.checklist);

        // Build activity log
        const log: ActivityEntry[] = [];
        if (i.submittedAt) log.push({ timestamp: i.submittedAt, action: 'Submitted', detail: `Submitted by ${i.agentDisplayName || i.submittedByEmail || 'agent'}` });
        if (i.reviewedAt && i.status === 'in_review') log.push({ timestamp: i.reviewedAt, action: 'In Review', detail: `Marked in review by ${i.reviewedBy || 'admin'}` });
        if (i.reviewedAt && i.status === 'approved') log.push({ timestamp: i.reviewedAt, action: 'Approved', detail: `Approved by ${i.reviewedBy || 'admin'}${i.approvedTransactionId ? ` (TX: ${i.approvedTransactionId})` : ''}` });
        if (i.reviewedAt && i.status === 'rejected') log.push({ timestamp: i.reviewedAt, action: 'Rejected', detail: `Rejected by ${i.reviewedBy || 'admin'}${i.rejectionReason ? `: ${i.rejectionReason}` : ''}` });
        if (i.commissionOverrideAt) log.push({ timestamp: i.commissionOverrideAt, action: 'Commission Override', detail: `Override set by ${i.commissionOverrideBy || 'admin'}` });
        if (i.archivedAt) log.push({ timestamp: i.archivedAt, action: 'Archived', detail: `Archived by ${i.archivedBy || 'admin'}${i.archiveReason ? `: ${i.archiveReason}` : ''}` });
        if (i.updatedAt && i.updatedAt !== i.submittedAt) log.push({ timestamp: i.updatedAt, action: 'Updated', detail: 'Intake data updated' });
        setActivityLog(log.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      } catch (err: any) {
        toast({ title: 'Error', description: err.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    if (!userLoading && user) load();
  }, [user, userLoading, id]);

  // ── Load TC profiles ─────────────────────────────────────────────────────
  useEffect(() => {
    const loadProfiles = async () => {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/staff-users', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (data.ok) {
          setTcProfiles((data.users as TcProfile[]).filter((u) => (u.role === 'tc' || u.role === 'tc_admin') && u.status === 'active'));
        }
      } catch { /* profiles may not exist */ }
    };
    if (!userLoading && user) loadProfiles();
  }, [user, userLoading]);

  // ── Actions ──────────────────────────────────────────────────────────────
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
      toast({ title: 'Transaction Approved', description: `Transaction ID: ${result.transactionId}` });
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

  const handleArchive = async () => {
    try {
      await callAction('archive', { archiveReason: archiveReason || 'Manually archived' });
      toast({ title: 'Intake Archived', description: 'Removed from active queue.' });
      setIntake((prev: any) => ({ ...prev, status: 'archived' }));
      setArchiveOpen(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleRemove = async () => {
    try {
      await callAction('remove');
      toast({ title: 'Intake Removed', description: 'Permanently deleted from queue.' });
      router.push('/dashboard/admin/tc');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleCommissionOverride = async () => {
    try {
      const token = await user!.getIdToken();
      const res = await fetch(`/api/admin/tc/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'commission_override',
          brokerPct: overrideValues.brokerPct !== '' ? Number(overrideValues.brokerPct) : null,
          agentPct: overrideValues.agentPct !== '' ? Number(overrideValues.agentPct) : null,
          agentDollar: overrideValues.agentDollar !== '' ? Number(overrideValues.agentDollar) : null,
          gci: overrideValues.gci !== '' ? Number(overrideValues.gci) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Override failed');
      toast({ title: 'Commission Override Saved', description: 'Override will be used on approval.' });
      setIntake((prev: any) => ({
        ...prev,
        commissionOverride: true,
        commissionOverrideBy: user?.email,
        commissionOverrideAt: new Date().toISOString(),
        ...Object.fromEntries(
          Object.entries(overrideValues)
            .filter(([, v]) => v !== '')
            .map(([k, v]) => [k, Number(v)])
        ),
      }));
      setOverrideOpen(false);
    } catch (err: any) {
      toast({ title: 'Override Failed', description: err.message, variant: 'destructive' });
    }
  };

  const assignTc = async (profileId: string | null) => {
    try {
      const token = await getToken();
      await fetch(`/api/admin/tc/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedTcProfileId: profileId }),
      });
      setIntake((prev: any) => ({ ...prev, assignedTcProfileId: profileId }));
      toast({ title: 'TC Assigned' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const toggleChecklistItem = async (item: ChecklistItem) => {
    const newCompleted = !item.completed;
    setChecklist((prev) =>
      prev.map((ci) =>
        ci.id === item.id
          ? { ...ci, completed: newCompleted, completedBy: newCompleted ? (user?.email || null) : null, completedAt: newCompleted ? new Date().toISOString() : null }
          : ci
      )
    );
    try {
      const token = await getToken();
      await fetch(`/api/admin/tc/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checklist: [{ itemId: item.id, completed: newCompleted, completedBy: newCompleted ? (user?.email || null) : null, completedAt: newCompleted ? new Date().toISOString() : null }],
        }),
      });
    } catch {
      setChecklist((prev) => prev.map((ci) => (ci.id === item.id ? item : ci)));
      toast({ title: 'Error', description: 'Failed to update checklist item', variant: 'destructive' });
    }
  };

  const changeStatus = async (newStatus: string) => {
    try {
      const token = await getToken();
      await fetch(`/api/admin/tc/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      setIntake((prev: any) => ({ ...prev, status: newStatus }));
      toast({ title: 'Status Updated' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  // ── Guards ───────────────────────────────────────────────────────────────
  if (userLoading || adminLoading || loading) {
    return <div className="space-y-4"><Skeleton className="h-12 w-1/3" /><Skeleton className="h-96 w-full" /></div>;
  }
  if (!user || !isStaff) {
    return <Alert variant="destructive"><AlertTitle>Access Denied</AlertTitle></Alert>;
  }
  if (!intake) {
    return <Alert><AlertTitle>Not Found</AlertTitle><AlertDescription>Intake not found.</AlertDescription></Alert>;
  }

  const isReadOnly = intake.status === 'approved' || intake.status === 'rejected' || intake.status === 'archived';
  const isActive = intake.status === 'submitted' || intake.status === 'in_review';
  const assignedTc = tcProfiles.find((p) => p.id === intake.assignedTcProfileId);
  const checklistCompleted = checklist.filter((c) => c.completed).length;
  const checklistTotal = checklist.length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Link href="/dashboard/admin/tc" className="hover:underline flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> TC Queue
          </Link>
          <span>/</span>
          <span className="font-mono text-xs">{id.slice(0, 8)}...</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{intake.address}</h1>
            <p className="text-muted-foreground">{intake.agentDisplayName} — {intake.clientName}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={cn('text-sm px-3 py-1', STATUS_BADGE[intake.status] || 'bg-muted text-foreground')}>
              {intake.status?.replace('_', ' ').toUpperCase()}
            </Badge>
            {intake.commissionOverride && (
              <Badge variant="outline" className="text-orange-600 border-orange-400">
                <DollarSign className="h-3 w-3 mr-1" /> Commission Override
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Meta info row */}
      <Card>
        <CardContent className="pt-4">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Dl label="Submitted" value={formatDateFull(intake.submittedAt)} />
            <Dl label="Last Updated" value={formatDateFull(intake.updatedAt)} />
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
          {intake.commissionOverride && (
            <div className="mt-3 pt-3 border-t border-orange-200 dark:border-orange-800">
              <p className="text-xs text-orange-600 dark:text-orange-400">
                <strong>Commission Override</strong> set by {intake.commissionOverrideBy} on {formatDateShort(intake.commissionOverrideAt)}.
                Auto-calculation will be skipped on approval.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contact Info — read-only summary card */}
      {(intake.buyerName || intake.sellerName || intake.loanOfficer || intake.titleOfficer ||
        intake.clientEmail || intake.otherAgentName) && (
        <SectionCard title="Contact Information" icon={<Users className="h-4 w-4" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {(intake.buyerName || intake.buyerEmail || intake.buyerPhone) && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Buyer</p>
                <ContactRow label="" name={intake.buyerName} email={intake.buyerEmail} phone={intake.buyerPhone} />
                {(intake.buyer2Name || intake.buyer2Email) && (
                  <ContactRow label="Buyer 2" name={intake.buyer2Name} email={intake.buyer2Email} phone={intake.buyer2Phone} />
                )}
              </div>
            )}
            {(intake.sellerName || intake.sellerEmail || intake.sellerPhone) && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Seller</p>
                <ContactRow label="" name={intake.sellerName} email={intake.sellerEmail} phone={intake.sellerPhone} />
                {(intake.seller2Name || intake.seller2Email) && (
                  <ContactRow label="Seller 2" name={intake.seller2Name} email={intake.seller2Email} phone={intake.seller2Phone} />
                )}
              </div>
            )}
            {(intake.loanOfficer || intake.mortgageCompany) && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lender</p>
                {intake.mortgageCompany && <p className="text-sm font-medium flex items-center gap-1"><Building2 className="h-3 w-3" />{intake.mortgageCompany}</p>}
                <ContactRow label="" name={intake.loanOfficer} email={intake.loanOfficerEmail} phone={intake.loanOfficerPhone} />
              </div>
            )}
            {(intake.titleOfficer || intake.titleCompany) && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Title</p>
                {intake.titleCompany && <p className="text-sm font-medium flex items-center gap-1"><Building2 className="h-3 w-3" />{intake.titleCompany}</p>}
                <ContactRow label="" name={intake.titleOfficer} email={intake.titleOfficerEmail} phone={intake.titleOfficerPhone} />
              </div>
            )}
            {(intake.otherAgentName || intake.otherBrokerage) && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Other Agent</p>
                <ContactRow label="" name={intake.otherAgentName} email={intake.otherAgentEmail} phone={intake.otherAgentPhone} />
                {intake.otherBrokerage && <p className="text-sm text-muted-foreground">{intake.otherBrokerage}</p>}
              </div>
            )}
            {(intake.clientEmail || intake.clientPhone) && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Client</p>
                <ContactRow label="" name={intake.clientName} email={intake.clientEmail} phone={intake.clientPhone} />
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* Co-agent info */}
      {intake.hasCoAgent && intake.coAgentDisplayName && (
        <SectionCard title="Co-Agent" icon={<User className="h-4 w-4" />}>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Dl label="Co-Agent" value={intake.coAgentDisplayName} />
            <Dl label="Role" value={intake.coAgentRole?.replace('_', ' ')} />
            <Dl label="Primary Split" value={intake.primaryAgentSplitPercent != null ? `${intake.primaryAgentSplitPercent}%` : null} />
            <Dl label="Co-Agent Split" value={intake.coAgentSplitPercent != null ? `${intake.coAgentSplitPercent}%` : null} />
          </dl>
        </SectionCard>
      )}

      {/* Assigned TC Coordinator */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserCheck className="h-4 w-4" /> Assigned TC Coordinator
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Select
              value={intake.assignedTcProfileId || 'unassigned'}
              onValueChange={(val) => assignTc(val === 'unassigned' ? null : val)}
            >
              <SelectTrigger className="w-[250px]">
                <SelectValue>{assignedTc ? assignedTc.displayName : 'Unassigned'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {tcProfiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.displayName} ({p.email})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {assignedTc && <span className="text-sm text-muted-foreground">{assignedTc.email}</span>}
          </div>
        </CardContent>
      </Card>

      {/* Status workflow + lifecycle actions */}
      {!isReadOnly && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Actions</CardTitle>
            <CardDescription>Workflow actions and queue lifecycle management.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              {intake.status === 'submitted' && (
                <Button variant="outline" size="sm" onClick={handleMarkInReview} disabled={acting}>
                  <Eye className="mr-2 h-4 w-4" /> Mark In Review
                </Button>
              )}
              {isActive && (
                <>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={form.handleSubmit(handleApprove)}
                    disabled={acting}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {acting ? 'Processing...' : 'Approve → Create Transaction'}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => setRejectOpen(true)} disabled={acting}>
                    <XCircle className="mr-2 h-4 w-4" /> Reject
                  </Button>
                </>
              )}
            </div>
            <Separator />
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setOverrideValues({
                    brokerPct: String(intake.brokerPct ?? ''),
                    agentPct: String(intake.agentPct ?? ''),
                    agentDollar: String(intake.agentDollar ?? ''),
                    gci: String(intake.gci ?? ''),
                  });
                  setOverrideOpen(true);
                }}
              >
                <DollarSign className="mr-2 h-4 w-4" />
                {intake.commissionOverride ? 'Edit Commission Override' : 'Set Commission Override'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setArchiveOpen(true)} disabled={acting}>
                <Archive className="mr-2 h-4 w-4" /> Archive
              </Button>
              <Button variant="outline" size="sm" className="text-red-600 border-red-300 hover:bg-red-50" onClick={() => setRemoveOpen(true)} disabled={acting}>
                <Trash2 className="mr-2 h-4 w-4" /> Remove
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Approving will create a live transaction in the ledger. Save any edits first.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Archived notice */}
      {intake.status === 'archived' && (
        <Alert className="border-gray-400">
          <Archive className="h-4 w-4" />
          <AlertTitle>Archived</AlertTitle>
          <AlertDescription>
            Archived by {intake.archivedBy} on {formatDateShort(intake.archivedAt)}.
            {intake.archiveReason && ` Reason: ${intake.archiveReason}`}
          </AlertDescription>
        </Alert>
      )}

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
            Approved and added to the Transaction Ledger.
            {intake.approvedTransactionId && <span className="block font-mono text-xs mt-1">TX: {intake.approvedTransactionId}</span>}
          </AlertDescription>
        </Alert>
      )}

      {/* Workflow Checklist */}
      {checklist.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4" /> Workflow Checklist
            </CardTitle>
            <CardDescription>
              {checklistCompleted} of {checklistTotal} items completed
              {checklistTotal > 0 && <span className="ml-2 text-xs">({Math.round((checklistCompleted / checklistTotal) * 100)}%)</span>}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {checklistTotal > 0 && (
              <div className="w-full bg-muted rounded-full h-2 mb-4">
                <div className="bg-green-600 h-2 rounded-full transition-all duration-300" style={{ width: `${(checklistCompleted / checklistTotal) * 100}%` }} />
              </div>
            )}
            <div className="space-y-3">
              {checklist.map((item) => (
                <div key={item.id} className={cn('flex items-start gap-3 p-3 rounded-md border transition-colors', item.completed ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' : 'bg-background')}>
                  <Checkbox checked={item.completed} onCheckedChange={() => toggleChecklistItem(item)} className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm', item.completed && 'line-through text-muted-foreground')}>{item.label}</p>
                    {item.completed && item.completedBy && (
                      <p className="text-xs text-muted-foreground mt-1">Completed by {item.completedBy}{item.completedAt && ` on ${formatDateShort(item.completedAt)}`}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">#{item.order}</span>
                </div>
              ))}
            </div>
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
                      <SelectItem value="dual">Dual Agent</SelectItem>
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
              {([
                ['listingDate', 'Listing Date'],
                ['contractDate', 'Under Contract Date'],
                ['optionExpiration', 'Option Expiration'],
                ['inspectionDeadline', 'Inspection Deadline'],
                ['surveyDeadline', 'Survey Deadline'],
                ['projectedCloseDate', 'Projected Close Date'],
                ['loanApplicationDeadline', 'Loan Application Deadline'],
                ['appraisalDeadline', 'Appraisal Deadline'],
                ['titleDeadline', 'Title Deadline'],
                ['finalLoanCommitmentDeadline', 'Final Loan Commitment'],
              ] as const).map(([name, label]) => (
                <FormField key={name} control={form.control} name={name as any} render={({ field }) => (
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
                  <FormDescription>Setting this marks the transaction as &quot;closed&quot; on approval.</FormDescription>
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
            {intake.commissionOverride && (
              <Alert className="border-orange-300 bg-orange-50 dark:bg-orange-950/20 py-2">
                <DollarSign className="h-4 w-4 text-orange-600" />
                <AlertDescription className="text-orange-700 dark:text-orange-400 text-xs">
                  Manual override active — these values will be used directly on approval instead of auto-calculation.
                </AlertDescription>
              </Alert>
            )}
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

          {/* Section 4: Client Contact */}
          <SectionCard title="Client Contact" icon={<User className="h-4 w-4" />}>
            <Grid3>
              <FormField control={form.control} name="clientEmail" render={({ field }) => (
                <FormItem><FormLabel>Client Email</FormLabel><FormControl><Input type="email" {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="clientPhone" render={({ field }) => (
                <FormItem><FormLabel>Client Phone</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="clientNewAddress" render={({ field }) => (
                <FormItem><FormLabel>Client New Address</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
            </Grid3>
            <Grid3>
              <FormField control={form.control} name="client2Name" render={({ field }) => (
                <FormItem><FormLabel>Client 2 Name</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="client2Email" render={({ field }) => (
                <FormItem><FormLabel>Client 2 Email</FormLabel><FormControl><Input type="email" {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="client2Phone" render={({ field }) => (
                <FormItem><FormLabel>Client 2 Phone</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
            </Grid3>
          </SectionCard>

          {/* Section 5: Buyer Contact */}
          <SectionCard title="Buyer Contact" icon={<User className="h-4 w-4" />}>
            <Grid3>
              <FormField control={form.control} name="buyerName" render={({ field }) => (
                <FormItem><FormLabel>Buyer Name</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="buyerEmail" render={({ field }) => (
                <FormItem><FormLabel>Buyer Email</FormLabel><FormControl><Input type="email" {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="buyerPhone" render={({ field }) => (
                <FormItem><FormLabel>Buyer Phone</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
            </Grid3>
            <Grid3>
              <FormField control={form.control} name="buyer2Name" render={({ field }) => (
                <FormItem><FormLabel>Buyer 2 Name</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="buyer2Email" render={({ field }) => (
                <FormItem><FormLabel>Buyer 2 Email</FormLabel><FormControl><Input type="email" {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="buyer2Phone" render={({ field }) => (
                <FormItem><FormLabel>Buyer 2 Phone</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
            </Grid3>
          </SectionCard>

          {/* Section 6: Seller Contact */}
          <SectionCard title="Seller Contact" icon={<User className="h-4 w-4" />}>
            <Grid3>
              <FormField control={form.control} name="sellerName" render={({ field }) => (
                <FormItem><FormLabel>Seller Name</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="sellerEmail" render={({ field }) => (
                <FormItem><FormLabel>Seller Email</FormLabel><FormControl><Input type="email" {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="sellerPhone" render={({ field }) => (
                <FormItem><FormLabel>Seller Phone</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
            </Grid3>
            <Grid3>
              <FormField control={form.control} name="seller2Name" render={({ field }) => (
                <FormItem><FormLabel>Seller 2 Name</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="seller2Email" render={({ field }) => (
                <FormItem><FormLabel>Seller 2 Email</FormLabel><FormControl><Input type="email" {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="seller2Phone" render={({ field }) => (
                <FormItem><FormLabel>Seller 2 Phone</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
            </Grid3>
          </SectionCard>

          {/* Section 7: Lender */}
          <SectionCard title="Lender / Mortgage" icon={<Building2 className="h-4 w-4" />}>
            <Grid3>
              <FormField control={form.control} name="mortgageCompany" render={({ field }) => (
                <FormItem><FormLabel>Mortgage Company</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="lenderOffice" render={({ field }) => (
                <FormItem><FormLabel>Lender Office</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="loanOfficer" render={({ field }) => (
                <FormItem><FormLabel>Loan Officer</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="loanOfficerEmail" render={({ field }) => (
                <FormItem><FormLabel>Loan Officer Email</FormLabel><FormControl><Input type="email" {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="loanOfficerPhone" render={({ field }) => (
                <FormItem><FormLabel>Loan Officer Phone</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
            </Grid3>
          </SectionCard>

          {/* Section 8: Title */}
          <SectionCard title="Title Company" icon={<Building2 className="h-4 w-4" />}>
            <Grid3>
              <FormField control={form.control} name="titleCompany" render={({ field }) => (
                <FormItem><FormLabel>Title Company</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="titleOffice" render={({ field }) => (
                <FormItem><FormLabel>Title Office</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="titleOfficer" render={({ field }) => (
                <FormItem><FormLabel>Title Officer</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="titleOfficerEmail" render={({ field }) => (
                <FormItem><FormLabel>Title Officer Email</FormLabel><FormControl><Input type="email" {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="titleOfficerPhone" render={({ field }) => (
                <FormItem><FormLabel>Title Officer Phone</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="titleAttorney" render={({ field }) => (
                <FormItem><FormLabel>Title Attorney</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
            </Grid3>
          </SectionCard>

          {/* Section 9: Other Agent */}
          <SectionCard title="Other Agent / Brokerage">
            <Grid3>
              <FormField control={form.control} name="otherAgentName" render={({ field }) => (
                <FormItem><FormLabel>Other Agent Name</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="otherAgentEmail" render={({ field }) => (
                <FormItem><FormLabel>Other Agent Email</FormLabel><FormControl><Input type="email" {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="otherAgentPhone" render={({ field }) => (
                <FormItem><FormLabel>Other Agent Phone</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="otherBrokerage" render={({ field }) => (
                <FormItem><FormLabel>Other Brokerage</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
            </Grid3>
          </SectionCard>

          {/* Section 10: Notes */}
          <SectionCard title="Notes & Comments">
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl><Textarea className="min-h-[80px]" {...field} disabled={isReadOnly} /></FormControl>
              </FormItem>
            )} />
            <FormField control={form.control} name="additionalComments" render={({ field }) => (
              <FormItem>
                <FormLabel>Additional Comments</FormLabel>
                <FormControl><Textarea className="min-h-[80px]" {...field} disabled={isReadOnly} /></FormControl>
              </FormItem>
            )} />
          </SectionCard>

          {/* Save / action buttons (bottom) */}
          {!isReadOnly && (
            <div className="flex flex-wrap items-center gap-3 pb-8">
              <Button type="submit" disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                type="button"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={form.handleSubmit(handleApprove)}
                disabled={acting}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {acting ? 'Approving...' : 'Approve → Create Transaction'}
              </Button>
              <Button type="button" variant="destructive" onClick={() => setRejectOpen(true)} disabled={acting}>
                <XCircle className="mr-2 h-4 w-4" /> Reject
              </Button>
            </div>
          )}
        </form>
      </Form>

      {/* Activity Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" /> Activity Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activityLog.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <div className="space-y-4">
              {activityLog.map((entry, index) => (
                <div key={index} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={cn('w-2 h-2 rounded-full mt-2',
                      entry.action === 'Approved' ? 'bg-green-500' :
                      entry.action === 'Rejected' ? 'bg-red-500' :
                      entry.action === 'In Review' ? 'bg-yellow-500' :
                      entry.action === 'Commission Override' ? 'bg-orange-500' :
                      entry.action === 'Archived' ? 'bg-gray-500' :
                      'bg-blue-500'
                    )} />
                    {index < activityLog.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                  </div>
                  <div className="pb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{entry.action}</span>
                      <span className="text-xs text-muted-foreground">{formatDateFull(entry.timestamp)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{entry.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject TC Submission</DialogTitle>
            <DialogDescription>Provide a reason for rejecting this submission.</DialogDescription>
          </DialogHeader>
          <Textarea placeholder="e.g. Missing contract date, GCI doesn't match..." className="min-h-[100px]" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={acting}>
              <XCircle className="mr-2 h-4 w-4" /> Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive dialog */}
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Intake</DialogTitle>
            <DialogDescription>This will remove the intake from the active queue but keep the record.</DialogDescription>
          </DialogHeader>
          <Input placeholder="Reason (optional)" value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveOpen(false)}>Cancel</Button>
            <Button onClick={handleArchive} disabled={acting}>
              <Archive className="mr-2 h-4 w-4" /> Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove dialog */}
      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Intake</DialogTitle>
            <DialogDescription>This will permanently delete this intake from the queue. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemove} disabled={acting}>
              <Trash2 className="mr-2 h-4 w-4" /> Permanently Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Commission Override dialog */}
      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Commission Override</DialogTitle>
            <DialogDescription>
              Manually set commission split values. When override is active, auto-calculation from the agent&apos;s tier plan is skipped on approval.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Broker %</label>
              <Input type="number" step="0.01" value={overrideValues.brokerPct} onChange={(e) => setOverrideValues(v => ({ ...v, brokerPct: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Agent %</label>
              <Input type="number" step="0.01" value={overrideValues.agentPct} onChange={(e) => setOverrideValues(v => ({ ...v, agentPct: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Agent Net $ (GCI)</label>
              <Input type="number" step="0.01" value={overrideValues.agentDollar} onChange={(e) => setOverrideValues(v => ({ ...v, agentDollar: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Total GCI ($)</label>
              <Input type="number" step="0.01" value={overrideValues.gci} onChange={(e) => setOverrideValues(v => ({ ...v, gci: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideOpen(false)}>Cancel</Button>
            <Button onClick={handleCommissionOverride}>
              <DollarSign className="mr-2 h-4 w-4" /> Save Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
