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
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ContactAutocomplete } from '@/components/contacts/ContactAutocomplete';
import type { SavedContact } from '@/hooks/useContactSearch';
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
  ArrowLeft, CheckCircle2, XCircle, Eye, Save, ExternalLink,
  ClipboardList, UserCheck, Activity, Archive, Trash2,
  Phone, Mail, Building2, User, Users, RefreshCw, AlertTriangle, FileText, Paperclip,
  UploadCloud, X, DollarSign, Banknote,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

// New per-transaction checklist layer types
type TxChecklistItem = {
  id: string;
  label: string;
  group: string;
  ifApplicable?: boolean;
  completed: boolean;
  completedBy: string | null;
  completedByName: string | null;
  completedAt: string | null;
  note: string | null;
};

type TxChecklist = {
  id: string;
  transactionId: string;
  checklistType: string;
  items: TxChecklistItem[];
  agentUpdateBanner: boolean;
  agentUpdateAt: string | null;
  agentUpdateDescription: string | null;
  status: 'active' | 'complete';
  completedAt: string | null;
  completedByName: string | null;
  createdAt: string;
};

type StaffProfile = {
  id: string;
  displayName: string;
  email: string;
  status: string;
};

type ActivityEntry = {
  timestamp: string;
  action: string;
  detail: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Form schema — full field set matching TC Queue
// ─────────────────────────────────────────────────────────────────────────────
const schema = z.object({
  closingType: z.enum(['buyer', 'listing', 'referral', 'dual']).optional(),
  dealType: z.enum(['residential_sale', 'residential_lease', 'land', 'commercial_sale', 'commercial_lease']).optional(),
  address: z.string().min(1, 'Address is required'),
  clientName: z.string().optional().or(z.literal('')),
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
  loanApplicationDeadline: z.string().optional().or(z.literal('')),
  appraisalDeadline: z.string().optional().or(z.literal('')),
  titleDeadline: z.string().optional().or(z.literal('')),
  finalLoanCommitmentDeadline: z.string().optional().or(z.literal('')),

  clientEmail: z.string().optional().or(z.literal('')),
  clientPhone: z.string().optional(),
  clientNewAddress: z.string().optional(),
  client2Name: z.string().optional(),
  client2Email: z.string().optional().or(z.literal('')),
  client2Phone: z.string().optional(),

  buyerName: z.string().optional(),
  buyerEmail: z.string().optional().or(z.literal('')),
  buyerPhone: z.string().optional(),
  buyer2Name: z.string().optional(),
  buyer2Email: z.string().optional().or(z.literal('')),
  buyer2Phone: z.string().optional(),

  sellerName: z.string().optional(),
  sellerEmail: z.string().optional().or(z.literal('')),
  sellerPhone: z.string().optional(),
  seller2Name: z.string().optional(),
  seller2Email: z.string().optional().or(z.literal('')),
  seller2Phone: z.string().optional(),

  otherAgentName: z.string().optional(),
  otherAgentEmail: z.string().optional().or(z.literal('')),
  otherAgentPhone: z.string().optional(),
  otherBrokerage: z.string().optional(),

  mortgageCompany: z.string().optional(),
  loanOfficer: z.string().optional(),
  loanOfficerEmail: z.string().optional().or(z.literal('')),
  loanOfficerPhone: z.string().optional(),
  lenderOffice: z.string().optional(),

  titleCompany: z.string().optional(),
  titleOfficer: z.string().optional(),
  titleOfficerEmail: z.string().optional().or(z.literal('')),
  titleOfficerPhone: z.string().optional(),
  titleAttorney: z.string().optional(),
  titleOffice: z.string().optional(),

  txComplianceFee: z.enum(['yes', 'no']).optional(),
  txComplianceFeeAmount: z.coerce.number().min(0).optional().or(z.literal('')),
  txComplianceFeePaidBy: z.string().optional(),

  staffNotes: z.string().optional(),
  notes: z.string().optional(),
  additionalComments: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
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

const STATUS_BADGE: Record<string, string> = {
  pending_review: 'bg-amber-500/80 text-white',
  in_progress: 'bg-blue-500/80 text-white',
  completed: 'bg-green-600/80 text-white',
  dismissed: 'bg-red-500/80 text-white',
  archived: 'bg-gray-500/80 text-white',
};

const DEAL_SOURCES = [
  { value: 'sphere_of_influence', label: 'Sphere of Influence' },
  { value: 'referral', label: 'Referral' },
  { value: 'zillow', label: 'Zillow' },
  { value: 'realtor_com', label: 'Realtor.com' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'open_house', label: 'Open House' },
  { value: 'sign_call', label: 'Sign Call' },
  { value: 'floor_call', label: 'Floor Call' },
  { value: 'internet_lead', label: 'Internet Lead' },
  { value: 'past_client', label: 'Past Client' },
  { value: 'other', label: 'Other' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function StaffQueueDetailPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = use(params);
  const { user, loading: userLoading } = useUser();
  const { isStaff, loading: staffLoading } = useIsStaff();
  const router = useRouter();
  const { toast } = useToast();

  const [item, setItem] = useState<any>(null);
  const [transaction, setTransaction] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [dismissReason, setDismissReason] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [removeOpen, setRemoveOpen] = useState(false);

  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // New transaction-level checklists (stacked layers)
  const [txChecklists, setTxChecklists] = useState<TxChecklist[]>([]);
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);
  const [addingChecklist, setAddingChecklist] = useState(false);
  const [newChecklistType, setNewChecklistType] = useState<string>('');

  // Commission processing state
  const [commissionOpen, setCommissionOpen] = useState(false);
  const [commissionMethod, setCommissionMethod] = useState<'check_front_desk' | 'direct_deposit'>('check_front_desk');
  const [commissionAmount, setCommissionAmount] = useState<string>('');
  const [commissionStaffNotes, setCommissionStaffNotes] = useState('');
  const [processingCommission, setProcessingCommission] = useState(false);

  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  const getToken = useCallback(async () => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);

  // ── Load item ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userLoading && !user) {
      setLoading(false);
      return;
    }
    const load = async () => {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/staff-queue/${itemId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load');

        setItem(data.item);
        setTransaction(data.transaction || null);
        setDocuments(data.documents || data.transaction?.documents || []);
        if (data.checklist?.length) setChecklist(data.checklist);
        if (data.staffProfiles?.length) {
          setStaffProfiles(data.staffProfiles.filter((p: StaffProfile) => p.status === 'active'));
        }
        if (data.activityLog?.length) {
          setActivityLog(
            [...data.activityLog].sort(
              (a: ActivityEntry, b: ActivityEntry) =>
                new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            )
          );
        }
        // Populate form: transaction > tcIntake > queue item (in priority order)
        const src = data.transaction || data.tcIntake || data.item;
        form.reset({
          closingType: src.closingType || undefined,
          dealType: src.dealType || undefined,
          address: src.propertyAddress || src.address || data.item.address || data.item.transactionAddress || '',
          clientName: src.clientName || '',
          dealSource: src.dealSource || '',
          listPrice: src.listPrice ?? '',
          salePrice: src.salePrice ?? src.dealValue ?? '',
          commissionPercent: src.commissionPercent ?? '',
          gci: src.gci ?? '',
          transactionFee: src.transactionFee ?? '',
          earnestMoney: src.earnestMoney ?? '',
          brokerPct: src.brokerPct ?? src.splitSnapshot?.companySplitPercent ?? '',
          brokerGci: src.brokerGci ?? src.splitSnapshot?.companyRetained ?? '',
          agentPct: src.agentPct ?? src.splitSnapshot?.agentSplitPercent ?? '',
          agentDollar: src.agentDollar ?? src.splitSnapshot?.agentNetCommission ?? '',
          listingDate: src.listingDate?.split('T')[0] || '',
          contractDate: src.contractDate?.split('T')[0] || '',
          optionExpiration: src.optionExpiration?.split('T')[0] || '',
          inspectionDeadline: src.inspectionDeadline?.split('T')[0] || '',
          surveyDeadline: src.surveyDeadline?.split('T')[0] || '',
          projectedCloseDate: src.projectedCloseDate?.split('T')[0] || '',
          closedDate: (src.closedDate || src.closingDate)?.split('T')[0] || '',
          loanApplicationDeadline: src.loanApplicationDeadline?.split('T')[0] || '',
          appraisalDeadline: src.appraisalDeadline?.split('T')[0] || '',
          titleDeadline: src.titleDeadline?.split('T')[0] || '',
          finalLoanCommitmentDeadline: src.finalLoanCommitmentDeadline?.split('T')[0] || '',
          clientEmail: src.clientEmail || '',
          clientPhone: src.clientPhone || '',
          clientNewAddress: src.clientNewAddress || '',
          client2Name: src.client2Name || '',
          client2Email: src.client2Email || '',
          client2Phone: src.client2Phone || '',
          buyerName: src.buyerName || '',
          buyerEmail: src.buyerEmail || '',
          buyerPhone: src.buyerPhone || '',
          buyer2Name: src.buyer2Name || '',
          buyer2Email: src.buyer2Email || '',
          buyer2Phone: src.buyer2Phone || '',
          sellerName: src.sellerName || '',
          sellerEmail: src.sellerEmail || '',
          sellerPhone: src.sellerPhone || '',
          seller2Name: src.seller2Name || '',
          seller2Email: src.seller2Email || '',
          seller2Phone: src.seller2Phone || '',
          otherAgentName: src.otherAgentName || '',
          otherAgentEmail: src.otherAgentEmail || '',
          otherAgentPhone: src.otherAgentPhone || '',
          otherBrokerage: src.otherBrokerage || '',
          mortgageCompany: src.mortgageCompany || '',
          loanOfficer: src.loanOfficer || '',
          loanOfficerEmail: src.loanOfficerEmail || '',
          loanOfficerPhone: src.loanOfficerPhone || '',
          lenderOffice: src.lenderOffice || '',
          titleCompany: src.titleCompany || '',
          titleOfficer: src.titleOfficer || '',
          titleOfficerEmail: src.titleOfficerEmail || '',
          titleOfficerPhone: src.titleOfficerPhone || '',
          titleAttorney: src.titleAttorney || '',
          titleOffice: src.titleOffice || '',
          txComplianceFee: src.txComplianceFee || undefined,
          txComplianceFeeAmount: src.txComplianceFeeAmount ?? '',
          txComplianceFeePaidBy: src.txComplianceFeePaidBy || '',
          staffNotes: data.item.staffNotes || '',
          notes: src.notes || '',
          additionalComments: src.additionalComments || '',
        });
      } catch (err: any) {
        toast({ title: 'Error loading item', description: err.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    if (!userLoading && user) load();
  }, [user, userLoading, itemId]);

  // ── Load transaction checklists ──────────────────────────────────────────
  const loadTxChecklists = useCallback(async (transactionId: string) => {
    if (!user || !transactionId) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/transaction-checklist?transactionId=${transactionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) setTxChecklists(data.checklists || []);
    } catch { /* non-fatal */ }
  }, [user]);

  useEffect(() => {
    if (transaction?.id) loadTxChecklists(transaction.id);
    else if (item?.transactionId) loadTxChecklists(item.transactionId);
  }, [transaction?.id, item?.transactionId, loadTxChecklists]);

  // ── Checklist helpers ────────────────────────────────────────────────────
  const handleChecklistItemToggle = async (checklistId: string, item: TxChecklistItem) => {
    if (!user) return;
    const token = await user.getIdToken();
    const newCompleted = !item.completed;
    // Optimistic update
    setTxChecklists(prev => prev.map(cl => {
      if (cl.id !== checklistId) return cl;
      return { ...cl, items: cl.items.map(i => i.id === item.id ? { ...i, completed: newCompleted, completedAt: newCompleted ? new Date().toISOString() : null } : i) };
    }));
    try {
      await fetch(`/api/admin/transaction-checklist/${checklistId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete_item', itemId: item.id }),
      });
    } catch {
      toast({ title: 'Error', description: 'Failed to update checklist item', variant: 'destructive' });
    }
  };

  const handleSaveNote = async (checklistId: string, itemId: string) => {
    if (!user) return;
    const noteKey = `${checklistId}:${itemId}`;
    const note = noteInputs[noteKey] || '';
    setSavingNote(noteKey);
    try {
      const token = await user.getIdToken();
      await fetch(`/api/admin/transaction-checklist/${checklistId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_note', itemId, note }),
      });
      setTxChecklists(prev => prev.map(cl => {
        if (cl.id !== checklistId) return cl;
        return { ...cl, items: cl.items.map(i => i.id === itemId ? { ...i, note } : i) };
      }));
      toast({ title: 'Note saved' });
    } catch {
      toast({ title: 'Error', description: 'Failed to save note', variant: 'destructive' });
    } finally {
      setSavingNote(null);
    }
  };

  const handleMarkChecklistComplete = async (checklistId: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await fetch(`/api/admin/transaction-checklist/${checklistId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_complete' }),
      });
      setTxChecklists(prev => prev.map(cl =>
        cl.id === checklistId ? { ...cl, status: 'complete', completedAt: new Date().toISOString() } : cl
      ));
      toast({ title: 'Checklist marked complete' });
    } catch {
      toast({ title: 'Error', description: 'Failed to mark complete', variant: 'destructive' });
    }
  };

  const handleClearBanner = async (checklistId: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await fetch(`/api/admin/transaction-checklist/${checklistId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_banner' }),
      });
      setTxChecklists(prev => prev.map(cl =>
        cl.id === checklistId ? { ...cl, agentUpdateBanner: false } : cl
      ));
    } catch { /* non-fatal */ }
  };

  const handleAddChecklist = async () => {
    if (!user || !newChecklistType) return;
    const txId = transaction?.id || item?.transactionId;
    if (!txId) return;
    setAddingChecklist(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/transaction-checklist', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: txId,
          checklistType: newChecklistType,
          agentId: transaction?.agentId || item?.agentId,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        await loadTxChecklists(txId);
        setNewChecklistType('');
        toast({ title: 'Checklist added' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to add checklist', variant: 'destructive' });
    } finally {
      setAddingChecklist(false);
    }
  };

  // ── Actions ──────────────────────────────────────────────────────────────
  const callAction = async (action: string, extra?: Record<string, any>) => {
    if (!user) return;
    setActing(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/staff-queue/${itemId}`, {
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

  const buildTxUpdates = (values: FormValues) => {
    const { staffNotes, notes, additionalComments, ...txFields } = values;
    return { ...txFields, notes, additionalComments };
  };

  // ── Document upload ────────────────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !user) return;
    setUploading(true);
    setUploadError(null);
    try {
      const token = await user.getIdToken();
      const uploaded: any[] = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/admin/staff-queue/upload-document', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || `Failed to upload ${file.name}`);
        uploaded.push({ name: file.name, url: data.url, storagePath: data.storagePath, uploadedAt: new Date().toISOString(), uploadedBy: 'staff' });
      }
      const newDocs = [...documents, ...uploaded];
      setDocuments(newDocs);
      // Persist to the linked transaction
      if (item?.transactionId) {
        const token2 = await user.getIdToken();
        await fetch(`/api/admin/staff-queue/${itemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token2}` },
          body: JSON.stringify({ action: 'add_documents', documents: newDocs }),
        });
      }
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeDoc = async (idx: number) => {
    const newDocs = documents.filter((_, i) => i !== idx);
    setDocuments(newDocs);
    if (item?.transactionId && user) {
      const token = await user.getIdToken();
      await fetch(`/api/admin/staff-queue/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'add_documents', documents: newDocs }),
      }).catch(() => {});
    }
  };

  const handleSave = async (values: FormValues) => {
    setSaving(true);
    try {
      const token = await user!.getIdToken();
      const res = await fetch(`/api/admin/staff-queue/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'save',
          staffNotes: values.staffNotes,
          txUpdates: buildTxUpdates(values),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Save failed');
      toast({ title: 'Changes Saved', description: 'Staff queue item updated successfully.' });
      setItem((prev: any) => ({ ...prev, staffNotes: values.staffNotes }));
    } catch (err: any) {
      toast({ title: 'Save Failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleMarkInProgress = async () => {
    try {
      await callAction('start_review');
      toast({ title: 'Marked In Progress' });
      setItem((prev: any) => ({ ...prev, status: 'in_progress' }));
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleComplete = async (values: FormValues) => {
    setSaving(true);
    try {
      const token = await user!.getIdToken();
      const res = await fetch(`/api/admin/staff-queue/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'complete',
          staffNotes: values.staffNotes,
          txUpdates: buildTxUpdates(values),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Complete failed');
      toast({ title: 'Item Completed ✅', description: 'Staff queue item marked as complete.' });
      setItem((prev: any) => ({ ...prev, status: 'completed' }));
    } catch (err: any) {
      toast({ title: 'Complete Failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = async () => {
    try {
      await callAction('dismiss', { dismissReason });
      toast({ title: 'Item Dismissed' });
      setItem((prev: any) => ({ ...prev, status: 'dismissed' }));
      setDismissOpen(false);
    } catch (err: any) {
      toast({ title: 'Dismiss Failed', description: err.message, variant: 'destructive' });
    }
  };

  const handleArchive = async () => {
    try {
      await callAction('archive', { archiveReason });
      toast({ title: 'Archived' });
      setItem((prev: any) => ({ ...prev, status: 'archived' }));
      setArchiveOpen(false);
    } catch (err: any) {
      toast({ title: 'Archive Failed', description: err.message, variant: 'destructive' });
    }
  };

  const handleRemove = async () => {
    try {
      await callAction('remove');
      toast({ title: 'Removed from Queue' });
      router.push('/dashboard/admin/staff-queue');
    } catch (err: any) {
      toast({ title: 'Remove Failed', description: err.message, variant: 'destructive' });
    }
  };

  const handleReopen = async () => {
    try {
      setActing(true);
      await callAction('reopen');
      toast({ title: 'Re-opened', description: 'Status set back to In Progress.' });
      setItem((prev: any) => ({ ...prev, status: 'in_progress' }));
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setActing(false);
    }
  };

  const handleProcessCommission = async () => {
    if (!user) return;
    setProcessingCommission(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/staff-queue/${itemId}/commission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          commissionMethod,
          commissionAmount: commissionAmount ? parseFloat(commissionAmount) : undefined,
          staffNotes: commissionStaffNotes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to process commission');
      toast({
        title: '🎉 Commission Processed!',
        description: commissionMethod === 'direct_deposit'
          ? 'Agent notified — commission sent via direct deposit.'
          : 'Agent notified — check is waiting at the front desk.',
      });
      setItem((prev: any) => ({ ...prev, status: 'completed', commissionProcessed: true }));
      setCommissionOpen(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setProcessingCommission(false);
    }
  };

  const assignStaff = async (profileId: string | null) => {
    try {
      const token = await getToken();
      await fetch(`/api/admin/staff-queue/${itemId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedStaffId: profileId }),
      });
      setItem((prev: any) => ({ ...prev, assignedStaffId: profileId }));
      toast({ title: 'Staff Assigned' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const toggleChecklistItem = async (ci: ChecklistItem) => {
    const newCompleted = !ci.completed;
    const now = new Date().toISOString();
    setChecklist((prev) =>
      prev.map((c) =>
        c.id === ci.id
          ? { ...c, completed: newCompleted, completedBy: newCompleted ? (user?.email || null) : null, completedAt: newCompleted ? now : null }
          : c
      )
    );
    try {
      const token = await getToken();
      await fetch(`/api/admin/staff-queue/${itemId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checklist: [{ itemId: ci.id, completed: newCompleted, completedBy: newCompleted ? (user?.email || null) : null, completedAt: newCompleted ? now : null }],
        }),
      });
    } catch {
      setChecklist((prev) => prev.map((c) => (c.id === ci.id ? ci : c)));
      toast({ title: 'Error', description: 'Failed to update checklist item', variant: 'destructive' });
    }
  };

  // ── Guards ───────────────────────────────────────────────────────────────
  if (userLoading || staffLoading || loading) {
    return (
      <div className="space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (!user || !isStaff) {
    return (
      <Alert variant="destructive" className="max-w-lg mx-auto mt-8">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Access Denied</AlertTitle>
        <AlertDescription>You do not have permission to view this page.</AlertDescription>
      </Alert>
    );
  }
  if (!item) {
    return (
      <Alert className="max-w-lg mx-auto mt-8">
        <AlertTitle>Not Found</AlertTitle>
        <AlertDescription>Staff queue item not found.</AlertDescription>
      </Alert>
    );
  }

  const isReadOnly = item.status === 'completed' || item.status === 'dismissed' || item.status === 'archived';
  const isActive = item.status === 'pending_review' || item.status === 'in_progress';
  const watchedTxComplianceFee = form.watch('txComplianceFee');
  const assignedStaff = staffProfiles.find((p) => p.id === item.assignedStaffId);
  const checklistCompleted = checklist.filter((c) => c.completed).length;
  const checklistTotal = checklist.length;

  const displayAddress = transaction?.propertyAddress || transaction?.address || item.transactionAddress || item.address || 'Staff Queue Item';
  const displayAgent = item.agentName || item.agentDisplayName || '';
  const displayClient = transaction?.clientName || item.clientName || '';

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Link href="/dashboard/admin/staff-queue" className="hover:underline flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Staff Queue
          </Link>
          <span>/</span>
          <span className="font-mono text-xs">{itemId.slice(0, 8)}...</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{displayAddress}</h1>
            <p className="text-muted-foreground">
              {displayAgent}{displayClient ? ` — ${displayClient}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={cn('text-sm px-3 py-1', STATUS_BADGE[item.status] || 'bg-muted text-foreground')}>
              {item.status?.replace(/_/g, ' ').toUpperCase()}
            </Badge>
            {item.actionType && (
              <Badge variant="outline" className="capitalize">
                {item.actionType.replace(/_/g, ' ')}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* ── Meta info row ──────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-4">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Dl label="Created" value={formatDateFull(item.createdAt)} />
            <Dl label="Last Updated" value={formatDateFull(item.updatedAt)} />
            <Dl label="Agent" value={displayAgent} />
            {item.transactionId && (
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
          {item.previousStatus && item.newStatus && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-muted-foreground">
                Status change:{' '}
                <span className="font-medium capitalize">{item.previousStatus.replace(/_/g, ' ')}</span>
                {' → '}
                <span className="font-medium capitalize">{item.newStatus.replace(/_/g, ' ')}</span>
              </p>
            </div>
          )}
          {item.notes && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-muted-foreground mb-1">Agent Note</p>
              <p className="text-sm">{item.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Assigned Staff ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserCheck className="h-4 w-4" /> Assigned Staff Member
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Select
              value={item.assignedStaffId || 'unassigned'}
              onValueChange={(val) => assignStaff(val === 'unassigned' ? null : val)}
            >
              <SelectTrigger className="w-[260px]">
                <SelectValue>{assignedStaff ? assignedStaff.displayName : 'Unassigned'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {staffProfiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.displayName} ({p.email})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {assignedStaff && <span className="text-sm text-muted-foreground">{assignedStaff.email}</span>}
          </div>
        </CardContent>
      </Card>

      {/* ── Actions (active items) ─────────────────────────────────────────── */}
      {isActive && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Actions</CardTitle>
            <CardDescription>Workflow actions for this queue item.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              {item.status === 'pending_review' && (
                <Button variant="outline" size="sm" onClick={handleMarkInProgress} disabled={acting}>
                  <Eye className="mr-2 h-4 w-4" /> Mark In Progress
                </Button>
              )}
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={form.handleSubmit(handleComplete)}
                disabled={acting || saving}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {acting ? 'Processing...' : 'Mark Complete'}
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setDismissOpen(true)} disabled={acting}>
                <XCircle className="mr-2 h-4 w-4" /> Dismiss
              </Button>
            </div>
            {/* Commission processing — shown for closed/closing transactions */}
            {(item.newStatus === 'closed' || item.actionType === 'closed_buyer' || transaction?.status === 'closed') && !item.commissionProcessed && (
              <>
                <Separator />
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-semibold text-amber-800 flex items-center gap-2 mb-2">
                    <DollarSign className="h-4 w-4" /> Commission Ready to Process
                  </p>
                  <p className="text-xs text-amber-700 mb-3">
                    This is a closed transaction. Once you have processed the commission, click below to notify the agent.
                  </p>
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={() => setCommissionOpen(true)}
                    disabled={acting}
                  >
                    <Banknote className="mr-2 h-4 w-4" /> Process Commission
                  </Button>
                </div>
              </>
            )}
            {item.commissionProcessed && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 flex items-center gap-2 text-sm text-green-800">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Commission processed and agent notified.
              </div>
            )}
            <Separator />
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" size="sm" onClick={() => setArchiveOpen(true)} disabled={acting}>
                <Archive className="mr-2 h-4 w-4" /> Archive
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 border-red-300 hover:bg-red-50"
                onClick={() => setRemoveOpen(true)}
                disabled={acting}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Remove
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Status notices ─────────────────────────────────────────────────── */}
      {item.status === 'archived' && (
        <Alert className="border-gray-400">
          <Archive className="h-4 w-4" />
          <AlertTitle>Archived</AlertTitle>
          <AlertDescription>
            {item.archivedBy && `Archived by ${item.archivedBy}`}
            {item.archivedAt && ` on ${formatDateShort(item.archivedAt)}`}.
            {item.archiveReason && ` Reason: ${item.archiveReason}`}
          </AlertDescription>
        </Alert>
      )}
      {item.status === 'dismissed' && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Dismissed</AlertTitle>
          <AlertDescription>{item.dismissReason || 'This item was dismissed.'}</AlertDescription>
        </Alert>
      )}
      {item.status === 'completed' && (
        <Alert className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-700 dark:text-green-400">Completed</AlertTitle>
          <AlertDescription>
            Completed by {item.reviewedByName || item.reviewedBy || 'staff'}
            {item.reviewedAt && ` on ${formatDateShort(item.reviewedAt)}`}.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Queue Management (read-only state) ────────────────────────────── */}
      {isReadOnly && (
        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Queue Management</CardTitle>
            <CardDescription>Admin actions to manage this item regardless of its current status.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" size="sm" disabled={acting} onClick={handleReopen}>
                <RefreshCw className="mr-2 h-4 w-4" /> Re-open
              </Button>
              <Button variant="outline" size="sm" onClick={() => setArchiveOpen(true)} disabled={acting}>
                <Archive className="mr-2 h-4 w-4" /> Archive
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 border-red-300 hover:bg-red-50"
                onClick={() => setRemoveOpen(true)}
                disabled={acting}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Remove from Queue
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              <strong>Re-open</strong> moves this back to &quot;In Progress&quot; so it can be edited and completed.{' '}
              <strong>Remove</strong> permanently deletes it from the queue.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Transaction Checklists (stacked layers) ────────────────────────── */}
      <div className="space-y-4">
        {/* Add Checklist */}
        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4" /> Transaction Checklists
            </CardTitle>
            <CardDescription>Add a checklist layer for this transaction. Completed layers are preserved as history below.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Select value={newChecklistType} onValueChange={setNewChecklistType}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select checklist type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new_listing">New Listing</SelectItem>
                  <SelectItem value="under_contract_seller">Under Contract — Seller</SelectItem>
                  <SelectItem value="under_contract_buyer">Under Contract — Buyer</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                disabled={!newChecklistType || addingChecklist}
                onClick={handleAddChecklist}
              >
                {addingChecklist ? 'Adding...' : '+ Add Checklist'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stacked checklist layers — newest first */}
        {txChecklists.map((cl, clIdx) => {
          const completedCount = cl.items.filter(i => i.completed).length;
          const totalCount = cl.items.length;
          const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
          const isCompleted = cl.status === 'complete';
          const isFirst = clIdx === 0;

          // Group items by their group field
          const groups: Record<string, TxChecklistItem[]> = {};
          for (const ci of cl.items) {
            if (!groups[ci.group]) groups[ci.group] = [];
            groups[ci.group].push(ci);
          }

          return (
            <Card key={cl.id} className={cn(isCompleted && 'opacity-75')}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {isCompleted
                        ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                        : <ClipboardList className="h-4 w-4" />
                      }
                      {cl.checklistType === 'new_listing' && 'New Listing Checklist'}
                      {cl.checklistType === 'under_contract_seller' && 'Under Contract — Seller Checklist'}
                      {cl.checklistType === 'under_contract_buyer' && 'Under Contract — Buyer Checklist'}
                      {isCompleted && <Badge className="bg-green-100 text-green-800 text-xs ml-1">Completed</Badge>}
                    </CardTitle>
                    <CardDescription>
                      {completedCount} of {totalCount} items • {pct}%
                      {isCompleted && cl.completedAt && ` • Completed ${formatDateShort(cl.completedAt)}`}
                      {!isFirst && <span className="ml-2 text-xs text-muted-foreground">(history)</span>}
                    </CardDescription>
                  </div>
                  {!isCompleted && (
                    <Button
                      type="button"
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white shrink-0"
                      onClick={() => handleMarkChecklistComplete(cl.id)}
                    >
                      <CheckCircle2 className="mr-1 h-3 w-3" /> Mark Complete
                    </Button>
                  )}
                </div>

                {/* Agent update banner */}
                {cl.agentUpdateBanner && (
                  <Alert className="border-amber-400 bg-amber-50 dark:bg-amber-950/20 mt-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertTitle className="text-amber-800 dark:text-amber-400 text-sm">
                      ⚠️ Agent updated this transaction — please review
                    </AlertTitle>
                    <AlertDescription className="text-xs">
                      {cl.agentUpdateDescription}
                      {cl.agentUpdateAt && ` • ${formatDateShort(cl.agentUpdateAt)}`}
                    </AlertDescription>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-1 h-6 text-xs"
                      onClick={() => handleClearBanner(cl.id)}
                    >
                      Dismiss
                    </Button>
                  </Alert>
                )}

                {/* Progress bar */}
                <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                  <div
                    className="bg-green-600 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                {Object.entries(groups).map(([groupName, groupItems]) => (
                  <div key={groupName}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{groupName}</p>
                    <div className="space-y-2">
                      {groupItems.map((ci) => {
                        const noteKey = `${cl.id}:${ci.id}`;
                        const noteVal = noteInputs[noteKey] !== undefined ? noteInputs[noteKey] : (ci.note || '');
                        return (
                          <div
                            key={ci.id}
                            className={cn(
                              'rounded-md border p-3 transition-colors',
                              ci.completed
                                ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                                : 'bg-background'
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <Checkbox
                                checked={ci.completed}
                                onCheckedChange={() => !isCompleted && handleChecklistItemToggle(cl.id, ci)}
                                disabled={isCompleted}
                                className="mt-0.5"
                              />
                              <div className="flex-1 min-w-0">
                                <p className={cn('text-sm', ci.completed && 'line-through text-muted-foreground')}>
                                  {ci.label}
                                  {ci.ifApplicable && <span className="ml-1 text-xs text-muted-foreground">(if applicable)</span>}
                                </p>
                                {ci.completed && ci.completedByName && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    ✓ {ci.completedByName}{ci.completedAt && ` • ${formatDateShort(ci.completedAt)}`}
                                  </p>
                                )}
                                {/* Note field */}
                                {!isCompleted && (
                                  <div className="mt-2 flex gap-2">
                                    <input
                                      type="text"
                                      placeholder="Add a note..."
                                      value={noteVal}
                                      onChange={(e) => setNoteInputs(prev => ({ ...prev, [noteKey]: e.target.value }))}
                                      className="flex-1 text-xs border rounded px-2 py-1 bg-background"
                                    />
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-6 text-xs px-2"
                                      disabled={savingNote === noteKey}
                                      onClick={() => handleSaveNote(cl.id, ci.id)}
                                    >
                                      {savingNote === noteKey ? '...' : 'Save'}
                                    </Button>
                                  </div>
                                )}
                                {isCompleted && ci.note && (
                                  <p className="text-xs text-muted-foreground mt-1 italic">"{ci.note}"</p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

            {/* ── Editable form ─────────────────────────────────────────────────── */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSave)} className="space-y-6">

          {/* Transaction Basics */}
          <SectionCard title="Transaction Basics">
            <Grid2>
              <FormField control={form.control} name="closingType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Type of Closing</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={isReadOnly}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
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
                    <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
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
                <FormLabel>Property Address</FormLabel>
                <FormControl><Input {...field} disabled={isReadOnly} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <Grid2>
              <FormField control={form.control} name="clientName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Client Name</FormLabel>
                  <FormControl>
                    {isReadOnly ? <Input {...field} disabled /> : (
                      <ContactAutocomplete
                        type="client"
                        placeholder="Search saved contacts…"
                        value={field.value || ''}
                        onChange={field.onChange}
                        onSelect={(c: SavedContact) => {
                          form.setValue('clientName', c.name || '');
                          if (c.email) form.setValue('clientEmail', c.email);
                          if (c.phone) form.setValue('clientPhone', c.phone);
                          if (c.newAddress) form.setValue('clientNewAddress', c.newAddress);
                        }}
                      />
                    )}
                  </FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="dealSource" render={({ field }) => (
                <FormItem>
                  <FormLabel>Lead Source</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={isReadOnly}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {DEAL_SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </Grid2>
          </SectionCard>

          {/* Key Dates */}
          <SectionCard title="Key Dates">
            <Grid3>
              {([
                ['listingDate', 'Listing Date'],
                ['contractDate', 'Under Contract Date'],
                ['optionExpiration', 'Listing Expiration Date'],
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
                </FormItem>
              )} />
            </div>
          </SectionCard>

          {/* Financial Details */}
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
                <FormItem><FormLabel>Agent Net ($)</FormLabel><FormControl><Input type="number" step="0.01" {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
            </Grid2>
            <div className="max-w-xs">
              <FormField control={form.control} name="earnestMoney" render={({ field }) => (
                <FormItem><FormLabel>Earnest Money ($)</FormLabel><FormControl><Input type="number" step="1" {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
            </div>
          </SectionCard>

          {/* Client Contact */}
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

          {/* Buyer */}
          <SectionCard title="Buyer Information" icon={<User className="h-4 w-4" />}>
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

          {/* Seller */}
          <SectionCard title="Seller Information" icon={<User className="h-4 w-4" />}>
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

          {/* Other Agent */}
          <SectionCard title="Other Agent / Co-op" icon={<Users className="h-4 w-4" />}>
            <Grid2>
              <FormField control={form.control} name="otherAgentName" render={({ field }) => (
                <FormItem><FormLabel>Other Agent Name</FormLabel><FormControl>
                  {isReadOnly ? <Input {...field} disabled /> : (
                    <ContactAutocomplete
                      type="other_agent"
                      placeholder="Search saved agents…"
                      value={field.value || ''}
                      onChange={field.onChange}
                      onSelect={(c: SavedContact) => {
                        form.setValue('otherAgentName', c.name || '');
                        form.setValue('otherBrokerage', c.brokerage || '');
                        form.setValue('otherAgentEmail', c.email || '');
                        form.setValue('otherAgentPhone', c.phone || '');
                      }}
                    />
                  )}
                </FormControl></FormItem>
              )} />
              <FormField control={form.control} name="otherBrokerage" render={({ field }) => (
                <FormItem><FormLabel>Other Brokerage</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="otherAgentEmail" render={({ field }) => (
                <FormItem><FormLabel>Other Agent Email</FormLabel><FormControl><Input type="email" {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="otherAgentPhone" render={({ field }) => (
                <FormItem><FormLabel>Other Agent Phone</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
            </Grid2>
          </SectionCard>

          {/* Lender */}
          <SectionCard title="Lender Information" icon={<Building2 className="h-4 w-4" />}>
            <Grid3>
              <FormField control={form.control} name="mortgageCompany" render={({ field }) => (
                <FormItem><FormLabel>Mortgage Company</FormLabel><FormControl>
                  {isReadOnly ? <Input {...field} disabled /> : (
                    <ContactAutocomplete
                      type="lender"
                      placeholder="Search saved lenders…"
                      value={field.value || ''}
                      onChange={field.onChange}
                      onSelect={(c: SavedContact) => {
                        form.setValue('mortgageCompany', c.companyName || c.name || '');
                        form.setValue('loanOfficer', c.officerName || '');
                        form.setValue('loanOfficerEmail', c.email || '');
                        form.setValue('loanOfficerPhone', c.phone || '');
                        form.setValue('lenderOffice', c.office || '');
                      }}
                    />
                  )}
                </FormControl></FormItem>
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

          {/* Title */}
          <SectionCard title="Title Information" icon={<Building2 className="h-4 w-4" />}>
            <Grid3>
              <FormField control={form.control} name="titleCompany" render={({ field }) => (
                <FormItem><FormLabel>Title Company</FormLabel><FormControl>
                  {isReadOnly ? <Input {...field} disabled /> : (
                    <ContactAutocomplete
                      type="title"
                      placeholder="Search saved title companies…"
                      value={field.value || ''}
                      onChange={field.onChange}
                      onSelect={(c: SavedContact) => {
                        form.setValue('titleCompany', c.companyName || c.name || '');
                        form.setValue('titleOfficer', c.officerName || '');
                        form.setValue('titleOfficerEmail', c.email || '');
                        form.setValue('titleOfficerPhone', c.phone || '');
                        form.setValue('titleAttorney', c.attorney || '');
                        form.setValue('titleOffice', c.office || '');
                      }}
                    />
                  )}
                </FormControl></FormItem>
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

          {/* Compliance Fee */}
          <SectionCard title="Transaction Compliance Fee">
            <Grid3>
              <FormField control={form.control} name="txComplianceFee" render={({ field }) => (
                <FormItem>
                  <FormLabel>Compliance Fee?</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={isReadOnly}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              {watchedTxComplianceFee === 'yes' && (
                <>
                  <FormField control={form.control} name="txComplianceFeeAmount" render={({ field }) => (
                    <FormItem><FormLabel>Amount ($)</FormLabel><FormControl><Input type="number" step="0.01" {...field} disabled={isReadOnly} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="txComplianceFeePaidBy" render={({ field }) => (
                    <FormItem><FormLabel>Paid By</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl></FormItem>
                  )} />
                </>
              )}
            </Grid3>
          </SectionCard>

          {/* Notes */}
          <SectionCard title="Notes">
            <FormField control={form.control} name="staffNotes" render={({ field }) => (
              <FormItem>
                <FormLabel>Staff Notes (internal only)</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={3} disabled={isReadOnly} placeholder="Internal notes visible only to staff..." />
                </FormControl>
              </FormItem>
            )} />
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Transaction Notes</FormLabel>
                <FormControl><Textarea {...field} rows={3} disabled={isReadOnly} /></FormControl>
              </FormItem>
            )} />
            <FormField control={form.control} name="additionalComments" render={({ field }) => (
              <FormItem>
                <FormLabel>Additional Comments</FormLabel>
                <FormControl><Textarea {...field} rows={2} disabled={isReadOnly} /></FormControl>
              </FormItem>
            )} />
          </SectionCard>

          {/* Documents — upload + view */}
          <SectionCard title="Documents" icon={<Paperclip className="h-4 w-4" />}>
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Upload contracts, disclosures, or any transaction documents (PDF, Word, images — max 25 MB each).
                Documents added by the agent or TC are also shown here.
              </p>

              {/* Document list */}
              {documents.length > 0 && (
                <div className="space-y-2">
                  {documents.map((doc: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium truncate hover:underline text-primary flex items-center gap-1"
                        >
                          {doc.name}
                          <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        </a>
                        <p className="text-xs text-muted-foreground">
                          {doc.uploadedBy === 'staff' ? 'Uploaded by staff' : doc.uploadedBy === 'tc' ? 'Uploaded by TC' : 'Uploaded by agent'}
                          {doc.uploadedAt ? ` · ${new Date(doc.uploadedAt).toLocaleDateString()}` : ''}
                        </p>
                      </div>
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() => removeDoc(idx)}
                          className="ml-auto p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          title="Remove document"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {documents.length === 0 && (
                <p className="text-xs text-muted-foreground italic">No documents attached yet.</p>
              )}

              {/* Upload error */}
              {uploadError && (
                <p className="text-xs text-destructive">{uploadError}</p>
              )}

              {/* Upload button */}
              {!isReadOnly && (
                <label className={cn(
                  'flex items-center gap-2 cursor-pointer rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground hover:bg-muted/30 transition-colors',
                  uploading && 'opacity-50 pointer-events-none'
                )}>
                  <UploadCloud className="h-4 w-4" />
                  {uploading ? 'Uploading…' : 'Attach Files'}
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.heic"
                    className="sr-only"
                    onChange={handleFileUpload}
                    disabled={uploading}
                  />
                </label>
              )}
            </div>
          </SectionCard>

          {/* Bottom action buttons */}
          {!isReadOnly && (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                type="button"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={form.handleSubmit(handleComplete)}
                disabled={acting || saving}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {acting ? 'Processing...' : 'Save & Mark Complete'}
              </Button>
              <Button type="button" variant="destructive" onClick={() => setDismissOpen(true)} disabled={acting}>
                <XCircle className="mr-2 h-4 w-4" /> Dismiss
              </Button>
            </div>
          )}
        </form>
      </Form>

      {/* ── Activity Log ───────────────────────────────────────────────────── */}
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
                    <div className={cn(
                      'w-2 h-2 rounded-full mt-2',
                      entry.action === 'Completed' ? 'bg-green-500' :
                      entry.action === 'Dismissed' ? 'bg-red-500' :
                      entry.action === 'In Progress' ? 'bg-yellow-500' :
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

      {/* ── Dialogs ────────────────────────────────────────────────────────── */}
      <Dialog open={dismissOpen} onOpenChange={setDismissOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dismiss Staff Queue Item</DialogTitle>
            <DialogDescription>Provide a reason for dismissing this item.</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="e.g. Duplicate request, already handled..."
            className="min-h-[100px]"
            value={dismissReason}
            onChange={(e) => setDismissReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDismissOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDismiss} disabled={acting}>
              <XCircle className="mr-2 h-4 w-4" /> Confirm Dismiss
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Item</DialogTitle>
            <DialogDescription>This will remove the item from the active queue but keep the record.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Reason (optional)"
            value={archiveReason}
            onChange={(e) => setArchiveReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveOpen(false)}>Cancel</Button>
            <Button onClick={handleArchive} disabled={acting}>
              <Archive className="mr-2 h-4 w-4" /> Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove from Queue</DialogTitle>
            <DialogDescription>
              This will permanently delete this item from the queue. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemove} disabled={acting}>
              <Trash2 className="mr-2 h-4 w-4" /> Permanently Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Commission Processing Dialog ──────────────────────────────────── */}
      <Dialog open={commissionOpen} onOpenChange={setCommissionOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-amber-600" /> Process Commission
            </DialogTitle>
            <DialogDescription>
              Mark this commission as processed and notify the agent.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium block mb-2">Commission Amount (optional)</label>
              <Input
                type="number"
                step="0.01"
                placeholder={`e.g. ${item?.gci ? Number(item.gci).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '5,000.00'}`}
                value={commissionAmount}
                onChange={(e) => setCommissionAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">Leave blank to use the GCI on file.</p>
            </div>
            <div>
              <label className="text-sm font-medium block mb-2">Payment Method</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCommissionMethod('check_front_desk')}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-sm font-medium transition-colors',
                    commissionMethod === 'check_front_desk'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:border-muted-foreground'
                  )}
                >
                  <Banknote className="h-6 w-6" />
                  Check at Front Desk
                </button>
                <button
                  type="button"
                  onClick={() => setCommissionMethod('direct_deposit')}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-sm font-medium transition-colors',
                    commissionMethod === 'direct_deposit'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:border-muted-foreground'
                  )}
                >
                  <DollarSign className="h-6 w-6" />
                  Direct Deposit
                </button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-2">Staff Notes (optional)</label>
              <Textarea
                placeholder="Any notes for the agent or internal record..."
                className="min-h-[80px]"
                value={commissionStaffNotes}
                onChange={(e) => setCommissionStaffNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCommissionOpen(false)} disabled={processingCommission}>
              Cancel
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleProcessCommission}
              disabled={processingCommission}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {processingCommission ? 'Processing...' : 'Confirm & Notify Agent'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
