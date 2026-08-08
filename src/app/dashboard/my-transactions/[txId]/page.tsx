'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useCallback, use, useRef } from 'react';
import { useUser } from '@/firebase';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, CheckCircle2, ClipboardList, AlertTriangle,
  Home, Users, Calendar, ChevronDown, ChevronUp,
  Building2, User, Hammer, MapPin, Info, DollarSign, FileText, ExternalLink,
  Save, Loader2, Camera, Eye, Wrench, Paintbrush,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Constants (mirrors Add Transaction form) ─────────────────────────────────
const INSPECTION_TYPE_OPTIONS = [
  'General Home Inspection', 'Roof Inspection', 'Termite Inspection',
  'Radon Inspection', 'Sewer Scope Inspection', 'Water Well Inspection',
  'Septic/Sewer Inspection', 'HVAC Inspection', 'Generator Inspection',
  'Foundation Inspection', 'Pool', 'Survey', 'Elevation Certificate',
];
const MEDIA_TYPE_OPTIONS = [
  'Photos', 'Twilight', 'Blue Sky', 'Stars', 'Full Production Video',
  'Virtual Tour', '3D Floor Plan', 'Virtual Staging', 'Floor Plan',
  'Drone', 'Sun Dial (Time-Lapse Sunlight)',
];
const SIGN_SERVICE_OPTIONS = [
  'Install Sign Post', 'Repair Sign Post or Panel', 'Remove Sign Post (No Fee)',
  'Commercial Sign-Frame 4x4', 'Commercial Sign-Frame 4x8', 'Other',
];
const SIGN_ADDITIONAL_OPTIONS = [
  'Directional Sign (+$2.00)', 'Attach Personalized Name Rider',
  'Text2 Rider', 'Phone# Rider EXT',
];
const SHOWING_NOTES_TO_AGENT_OPTIONS = [
  'Leave card', 'Lock doors', 'Turn off lights',
  'Scramble lockbox when leaving', 'Remove shoes or wear booties',
  'Return and secure key in lockbox',
];

type AgentTask = {
  id: string; label: string; group: string; phase: string;
  completed: boolean; completedAt: string | null;
  dueDate: string | null; reminderSentAt: string | null;
};

function formatDate(d?: string | null) {
  if (!d) return null;
  try { return format(parseISO(d), 'MMM d, yyyy'); } catch { return d; }
}

const PHASE_LABELS: Record<string, string> = {
  after_listing: 'After Listing Taken',
  before_closing: 'Before Closing',
  after_closing: 'After Closing',
  after_contract: 'After Contract Executed',
};
const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  under_contract: 'bg-blue-100 text-blue-800',
  closed: 'bg-gray-100 text-gray-700',
  coming_soon: 'bg-purple-100 text-purple-800',
  expired: 'bg-red-100 text-red-800',
  canceled: 'bg-red-100 text-red-800',
};

// ─── Read-only display helpers ────────────────────────────────────────────────
function Dl({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium mt-0.5">{value}</dd>
    </div>
  );
}
function Grid2({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">{children}</dl>;
}
function Grid3({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-sm">{children}</dl>;
}

// ─── Editable field helpers ───────────────────────────────────────────────────
function EInput({ label, name, value, onChange, type = 'text', placeholder }: {
  label: string; name: string; value: string; onChange: (n: string, v: string) => void;
  type?: string; placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(name, e.target.value)} className="h-8 text-sm" />
    </div>
  );
}
function ESelect({ label, name, value, onChange, options }: {
  label: string; name: string; value: string; onChange: (n: string, v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value || ''} onValueChange={v => onChange(name, v)}>
        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
function ETextarea({ label, name, value, onChange, placeholder }: {
  label: string; name: string; value: string; onChange: (n: string, v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Textarea value={value} placeholder={placeholder} rows={3}
        onChange={e => onChange(name, e.target.value)} className="text-sm" />
    </div>
  );
}
function ESwitch({ label, name, value, onChange }: {
  label: string; name: string; value: boolean; onChange: (n: string, v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch checked={value} onCheckedChange={v => onChange(name, v)} id={`sw-${name}`} />
      <Label htmlFor={`sw-${name}`} className="text-sm cursor-pointer">{label}</Label>
    </div>
  );
}
function ECheckboxGroup({ label, name, options, value, onChange }: {
  label: string; name: string; options: string[];
  value: string[]; onChange: (n: string, v: string[]) => void;
}) {
  const toggle = (opt: string) => {
    const next = value.includes(opt) ? value.filter(x => x !== opt) : [...value, opt];
    onChange(name, next);
  };
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1">
        {options.map(opt => (
          <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={value.includes(opt)} onCheckedChange={() => toggle(opt)} />
            {opt}
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── Section card with collapse ───────────────────────────────────────────────
function SectionCard({ title, icon, children, defaultCollapsed = false }: {
  title: string; icon?: React.ReactNode; children: React.ReactNode; defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <Card>
      <CardHeader className="cursor-pointer select-none" onClick={() => setCollapsed(c => !c)}>
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">{icon}{title}</span>
          {collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
        </CardTitle>
      </CardHeader>
      {!collapsed && <CardContent>{children}</CardContent>}
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TransactionDetailPage({ params }: { params: Promise<{ txId: string }> }) {
  const { txId } = use(params);
  const { user, loading: userLoading } = useUser();
  const { toast } = useToast();
  const [transaction, setTransaction] = useState<any>(null);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [collapsedPhases, setCollapsedPhases] = useState<Record<string, boolean>>({ after_closing: true });

  // ── Document management state ────────────────────────────────────────────────────────────
  type TxDoc = { name: string; url: string; storagePath: string; uploadedAt: string; archived?: boolean };
  const [docs, setDocs] = useState<TxDoc[]>([]);
  const [docUploading, setDocUploading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const docFileRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const txRes = await fetch(`/api/agent/transactions/${txId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const txData = await txRes.json();
      if (txData.ok) {
        const tx = txData.transaction || txData;
        setTransaction(tx);
        // Initialise documents from transaction
        setDocs(Array.isArray(tx.documents) ? tx.documents : []);
        // Initialise form state from transaction data
        setForm({
          status: tx.status || '',
          propertyAddress: tx.propertyAddress || tx.address || '',
          listPrice: tx.listPrice ? String(tx.listPrice) : '',
          salePrice: tx.salePrice ? String(tx.salePrice) : '',
          listingDate: tx.listingDate || '',
          listingExpirationDate: tx.listingExpirationDate || '',
          contractDate: tx.contractDate || '',
          closingDate: tx.closingDate || '',
          closedDate: tx.closedDate || '',
          projectedCloseDate: tx.projectedCloseDate || '',
          optionExpiration: tx.optionExpiration || '',
          inspectionDeadline: tx.inspectionDeadline || '',
          appraisalDeadline: tx.appraisalDeadline || '',
          surveyDeadline: tx.surveyDeadline || '',
          titleDeadline: tx.titleDeadline || '',
          finalLoanCommitmentDeadline: tx.finalLoanCommitmentDeadline || '',
          loanApplicationDeadline: tx.loanApplicationDeadline || '',
          // Seller
          sellerName: tx.sellerName || '', sellerEmail: tx.sellerEmail || '', sellerPhone: tx.sellerPhone || '',
          seller2Name: tx.seller2Name || '', seller2Email: tx.seller2Email || '', seller2Phone: tx.seller2Phone || '',
          // Buyer
          buyerName: tx.buyerName || '', buyerEmail: tx.buyerEmail || '', buyerPhone: tx.buyerPhone || '',
          buyer2Name: tx.buyer2Name || '', buyer2Email: tx.buyer2Email || '', buyer2Phone: tx.buyer2Phone || '',
          // Other agent
          otherAgentName: tx.otherAgentName || '', otherAgentEmail: tx.otherAgentEmail || '',
          otherAgentPhone: tx.otherAgentPhone || '', otherAgentBrokerage: tx.otherAgentBrokerage || '',
          // Lender
          mortgageCompany: tx.mortgageCompany || '', loanOfficer: tx.loanOfficer || '',
          loanOfficerEmail: tx.loanOfficerEmail || '', loanOfficerPhone: tx.loanOfficerPhone || '',
          lenderOffice: tx.lenderOffice || '',
          // Title
          titleCompany: tx.titleCompany || '', titleOfficer: tx.titleOfficer || '',
          titleOfficerEmail: tx.titleOfficerEmail || '', titleOfficerPhone: tx.titleOfficerPhone || '',
          titleOffice: tx.titleOffice || '', titleAttorney: tx.titleAttorney || '',
          // Financial
          earnestMoney: tx.earnestMoney ? String(tx.earnestMoney) : '',
          depositHolder: tx.depositHolder || '', depositHolderOther: tx.depositHolderOther || '',
          buyerClosingCostTotal: tx.buyerClosingCostTotal ? String(tx.buyerClosingCostTotal) : '',
          // Additional info
          warrantyAtClosing: tx.warrantyAtClosing || '',
          warrantyAmount: tx.warrantyAmount ? String(tx.warrantyAmount) : '',
          warrantyPaidBy: tx.warrantyPaidBy || '',
          shortageInCommission: tx.shortageInCommission || '',
          shortageAmount: tx.shortageAmount ? String(tx.shortageAmount) : '',
          occupancyAgreement: tx.occupancyAgreement || '',
          occupancyDates: tx.occupancyDates || '',
          txComplianceFee: tx.txComplianceFee || '',
          txComplianceFeeAmount: tx.txComplianceFeeAmount ? String(tx.txComplianceFeeAmount) : '',
          txComplianceFeePaidBy: tx.txComplianceFeePaidBy || '',
          // Buyer inspection
          inspectionOrdered: tx.inspectionOrdered || '',
          targetInspectionDate: tx.targetInspectionDate || '',
          inspectorName: tx.inspectorName || '',
          inspectionTypes: Array.isArray(tx.inspectionTypes) ? tx.inspectionTypes : [],
          tcScheduleInspections: tx.tcScheduleInspections || '',
          // Pre-listing inspection
          preListingInspectionOrdered: tx.preListingInspectionOrdered || '',
          preListingTargetInspectionDate: tx.preListingTargetInspectionDate || '',
          preListingInspectorName: tx.preListingInspectorName || '',
          preListingInspectionTypes: Array.isArray(tx.preListingInspectionTypes) ? tx.preListingInspectionTypes : [],
          preListingTcScheduleInspections: tx.preListingTcScheduleInspections || '',
          // Media
          mediaRequested: tx.mediaRequested === true || tx.mediaRequested === 'yes',
          mediaTypes: Array.isArray(tx.mediaTypes) ? tx.mediaTypes : [],
          mediaRequestedDate: tx.mediaRequestedDate || '',
          mediaNotes: tx.mediaNotes || '',
          // Sign order
          signOrderRequested: tx.signOrderRequested === true || tx.signOrderRequested === 'yes',
          signServiceType: tx.signServiceType || '',
          signInstallDate: tx.signInstallDate || '',
          signOwnerName: tx.signOwnerName || '',
          signRider: Array.isArray(tx.signRider) ? tx.signRider : [],
          signAdditionalOptions: Array.isArray(tx.signAdditionalOptions) ? tx.signAdditionalOptions : [],
          signRiderExt: tx.signRiderExt || '',
          signRequestedDate: tx.signRequestedDate || '',
          signSpecialRequests: tx.signSpecialRequests || '',
          // ShowingTime
          showingTimeRequested: tx.showingTimeRequested === true || tx.showingTimeRequested === 'yes',
          showingApptType: tx.showingApptType || '',
          showingNewOrChange: tx.showingNewOrChange || '',
          showingApptHandling: tx.showingApptHandling || '',
          showingLeadTimeRequired: tx.showingLeadTimeRequired || tx.showingLeadTime || '',
          showingLeadTime: tx.showingLeadTime || '',
          showingLeadTimeSuggested: tx.showingLeadTimeSuggested || '',
          showingMaxApptLength: tx.showingMaxApptLength || '',
          showingApptOverlaps: Boolean(tx.showingApptOverlaps),
          showingNoSameDayAppts: Boolean(tx.showingNoSameDayAppts),
          showingVirtualPreference: tx.showingVirtualPreference || '',
          showingShareAgentInfo: Boolean(tx.showingShareAgentInfo),
          showingAccessType: tx.showingAccessType || '',
          showingAccessDoor: tx.showingAccessDoor || '',
          showingLockboxCode: tx.showingLockboxCode || '',
          showingAlarmCode: tx.showingAlarmCode || '',
          showingDisarmCode: tx.showingDisarmCode || '',
          showingPasscode: tx.showingPasscode || '',
          showingAlarmNotes: tx.showingAlarmNotes || '',
          showingAccessNotes: tx.showingAccessNotes || '',
          showingNotesToAgent: Array.isArray(tx.showingNotesToAgent) ? tx.showingNotesToAgent : [],
          showingNotesToAgentOther: tx.showingNotesToAgentOther || '',
          showingArmCode: tx.showingArmCode || '',
          showingNotesToStaff: tx.showingNotesToStaff || '',
          showingCallOrder1Name: tx.showingCallOrder1Name || '',
          showingCallOrder1Mobile: tx.showingCallOrder1Mobile || '',
          showingCallOrder1Email: tx.showingCallOrder1Email || '',
          showingCallOrder2Name: tx.showingCallOrder2Name || '',
          showingCallOrder2Mobile: tx.showingCallOrder2Mobile || '',
          showingCallOrder2Email: tx.showingCallOrder2Email || '',
          showingCallOrder2AltPhone: tx.showingCallOrder2AltPhone || '',
          showingCallOrder2Type: tx.showingCallOrder2Type || '',
          showingCallOrder2Confirm: Array.isArray(tx.showingCallOrder2Confirm) ? tx.showingCallOrder2Confirm : (tx.showingCallOrder2Confirm ? [tx.showingCallOrder2Confirm] : []),
          showingCallOrder2Notify: Array.isArray(tx.showingCallOrder2Notify) ? tx.showingCallOrder2Notify : (tx.showingCallOrder2Notify ? [tx.showingCallOrder2Notify] : []),
          showingCallOrder3Name: tx.showingCallOrder3Name || '',
          showingCallOrder3Mobile: tx.showingCallOrder3Mobile || '',
          showingCallOrder3Email: tx.showingCallOrder3Email || '',
          showingCallOrder3AltPhone: tx.showingCallOrder3AltPhone || '',
          showingCallOrder3Type: tx.showingCallOrder3Type || '',
          showingCallOrder3Confirm: Array.isArray(tx.showingCallOrder3Confirm) ? tx.showingCallOrder3Confirm : (tx.showingCallOrder3Confirm ? [tx.showingCallOrder3Confirm] : []),
          showingCallOrder3Notify: Array.isArray(tx.showingCallOrder3Notify) ? tx.showingCallOrder3Notify : (tx.showingCallOrder3Notify ? [tx.showingCallOrder3Notify] : []),
          // Notes
          notes: tx.notes || '',
          additionalComments: tx.additionalComments || '',
          // TC
          workingWithTc: Boolean(tx.workingWithTc),
        });
      }
      const taskRes = await fetch(`/api/agent/agent-tasks?transactionId=${txId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const taskData = await taskRes.json();
      if (taskData.ok) setTasks(taskData.tasks || []);
    } catch { /* non-fatal */ } finally { setLoading(false); }
  }, [user, txId]);

  useEffect(() => {
    if (!userLoading && user) loadData();
    else if (!userLoading && !user) setLoading(false);
  }, [user, userLoading, loadData]);

  const setField = (name: string, value: any) => {
    setForm(prev => ({ ...prev, [name]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!user || !dirty) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/agent/transactions/${txId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          // Coerce numeric fields
          listPrice: form.listPrice ? Number(form.listPrice) : undefined,
          salePrice: form.salePrice ? Number(form.salePrice) : undefined,
          earnestMoney: form.earnestMoney ? Number(form.earnestMoney) : undefined,
          buyerClosingCostTotal: form.buyerClosingCostTotal ? Number(form.buyerClosingCostTotal) : undefined,
          warrantyAmount: form.warrantyAmount ? Number(form.warrantyAmount) : undefined,
          shortageAmount: form.shortageAmount ? Number(form.shortageAmount) : undefined,
          txComplianceFeeAmount: form.txComplianceFeeAmount ? Number(form.txComplianceFeeAmount) : undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast({ title: 'Saved', description: 'Transaction updated successfully.' });
        setDirty(false);
        await loadData();
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to save.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error. Please try again.', variant: 'destructive' });
    } finally { setSaving(false); }
  };

  // ── Document management handlers ────────────────────────────────────────────────────────────
  const handleDocUpload = async (files: FileList | null) => {
    if (!files || !user) return;
    setDocUploading(true);
    try {
      const token = await user.getIdToken();
      const newDocs: TxDoc[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/agent/transactions/upload-document', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          toast({ title: 'Upload failed', description: data.error || file.name, variant: 'destructive' });
        } else {
          newDocs.push({ name: data.name, url: data.url, storagePath: data.storagePath, uploadedAt: data.uploadedAt });
        }
      }
      if (newDocs.length > 0) {
        // Save to transaction via PATCH (merge logic on server appends to existing)
        const patchRes = await fetch(`/api/agent/transactions/${txId}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ documents: newDocs }),
        });
        const patchData = await patchRes.json();
        if (patchData.ok) {
          setDocs(prev => [...prev, ...newDocs]);
          toast({ title: `${newDocs.length === 1 ? 'Document' : `${newDocs.length} documents`} uploaded`, description: newDocs.map(d => d.name).join(', ') });
        } else {
          toast({ title: 'Upload error', description: patchData.error || 'Could not save documents.', variant: 'destructive' });
        }
      }
    } catch (err: any) {
      toast({ title: 'Upload error', description: err.message, variant: 'destructive' });
    } finally {
      setDocUploading(false);
      if (docFileRef.current) docFileRef.current.value = '';
    }
  };

  const handleDocDelete = async (storagePath: string) => {
    if (!user) return;
    if (!confirm('Delete this document? This cannot be undone.')) return;
    try {
      const token = await user.getIdToken();
      const remaining = docs.filter(d => d.storagePath !== storagePath);
      const res = await fetch(`/api/agent/transactions/${txId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        // Send the full remaining list — server will overwrite (delete logic)
        body: JSON.stringify({ _replaceDocuments: true, documents: remaining }),
      });
      const data = await res.json();
      if (data.ok) {
        setDocs(remaining);
        toast({ title: 'Document deleted' });
      } else {
        toast({ title: 'Error', description: data.error || 'Could not delete.', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleDocArchive = async (storagePath: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const updated = docs.map(d => d.storagePath === storagePath ? { ...d, archived: !d.archived } : d);
      const res = await fetch(`/api/agent/transactions/${txId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ _replaceDocuments: true, documents: updated }),
      });
      const data = await res.json();
      if (data.ok) {
        setDocs(updated);
        const doc = docs.find(d => d.storagePath === storagePath);
        toast({ title: doc?.archived ? 'Document restored' : 'Document archived' });
      } else {
        toast({ title: 'Error', description: data.error || 'Could not archive.', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleToggleTask = async (task: AgentTask) => {
    if (!user) return;
    const token = await user.getIdToken();
    const newCompleted = !task.completed;
    setTasks(prev => prev.map(t =>
      t.id === task.id ? { ...t, completed: newCompleted, completedAt: newCompleted ? new Date().toISOString() : null } : t
    ));
    try {
      await fetch(`/api/agent/agent-tasks`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, completed: newCompleted }),
      });
    } catch {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t));
    }
  };

  const togglePhase = (phase: string) => setCollapsedPhases(prev => ({ ...prev, [phase]: !prev[phase] }));

  if (userLoading || loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!user) {
    return (
      <Alert variant="destructive" className="max-w-lg mx-auto mt-8">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Not Logged In</AlertTitle>
        <AlertDescription>Please log in to view this transaction.</AlertDescription>
      </Alert>
    );
  }
  const tx = transaction;
  if (!tx) {
    return (
      <Alert className="max-w-lg mx-auto mt-8">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Transaction Not Found</AlertTitle>
        <AlertDescription>This transaction could not be loaded.</AlertDescription>
      </Alert>
    );
  }

  const address = tx.propertyAddress || tx.address || 'Transaction';
  const status = tx.status || 'active';
  // closingType is the canonical field (buyer/listing/dual/referral).
  // dealType is the property type (residential_sale, land, commercial, etc.) and must NOT be used to determine side.
  const side = tx.closingType || tx.side || '';
  const isListing = side === 'listing' || side === 'dual';
  const isBuyer = side === 'buyer';

  // Group tasks by phase
  const phases: Record<string, AgentTask[]> = {};
  for (const task of tasks) {
    const ph = task.phase || 'after_listing';
    if (!phases[ph]) phases[ph] = [];
    phases[ph].push(task);
  }
  const phaseOrder = ['after_listing', 'after_contract', 'before_closing', 'after_closing'];
  const completedCount = tasks.filter(t => t.completed).length;
  const totalCount = tasks.length;
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Commission (read-only)
  const agentNet = tx.splitSnapshot?.agentNetCommission ?? tx.agentDollar ?? null;
  const agentPct = tx.splitSnapshot?.agentSplitPercent ?? tx.agentPct ?? null;
  const sellerCommPct = tx.sellerPayingListingAgent ?? tx.commissionPercent ?? null;
  const txSalePrice = Number(tx.salePrice) || 0;
  const txListPrice = Number(tx.listPrice) || 0;
  const txStatus = tx.status || '';
  const isActiveTx = ['active', 'coming_soon', 'temp_off_market'].includes(txStatus);
  const commissionIsEstimated = isActiveTx && txSalePrice === 0 && txListPrice > 0;

  // Extended commission display fields
  const commissionBasePrice = Number(tx.priceCommissionBasedOn) || txSalePrice || (commissionIsEstimated ? txListPrice : 0);
  const buyerCommPct = tx.sellerPayingBuyerAgent ?? null;
  const displayPrice = commissionIsEstimated ? txListPrice : (txSalePrice || txListPrice);
  const fmt$ = (v: number) => '$' + v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const f = form; // shorthand

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/dashboard/my-transactions" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2">
            <ArrowLeft className="h-4 w-4" /> My Transactions
          </Link>
          <h1 className="text-xl font-bold">{address}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge className={cn('text-xs', STATUS_COLORS[status] || 'bg-gray-100 text-gray-700')}>
              {status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
            </Badge>
            {side && <Badge variant="outline" className="text-xs capitalize">{side}</Badge>}
          </div>
        </div>
        <Button onClick={handleSave} disabled={!dirty || saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>

      {dirty && (
        <Alert className="border-yellow-300 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800 text-sm">You have unsaved changes. Click Save Changes to update this transaction.</AlertDescription>
        </Alert>
      )}

      {/* ── Commission (read-only) ─────────────────────────────────────────── */}
      {(agentNet !== null || agentPct !== null || sellerCommPct !== null || displayPrice > 0) && (
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-700" />
              My Commission
              {commissionIsEstimated && (
                <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                  ⚠️ Estimated (based on list price)
                </span>
              )}
            </CardTitle>
            {commissionIsEstimated && (
              <p className="text-xs text-amber-600 mt-1">Will recalculate from sale price once marked pending.</p>
            )}
          </CardHeader>
          <CardContent>
            <Grid3>
              {/* Row 1: Price fields */}
              {displayPrice > 0 && (
                <Dl label={commissionIsEstimated ? 'List Price' : 'Sale Price'} value={fmt$(displayPrice)} />
              )}
              {commissionBasePrice > 0 && commissionBasePrice !== displayPrice && (
                <Dl label="Commission Base Price" value={fmt$(commissionBasePrice)} />
              )}
              {/* Row 2: Commission % fields */}
              {sellerCommPct !== null && (
                <Dl label="Seller Paying (Listing Agent %)" value={`${sellerCommPct}%`} />
              )}
              {buyerCommPct !== null && (
                <Dl label="Seller Paying (Buyer Agent %)" value={`${buyerCommPct}%`} />
              )}
              {/* Row 3: Agent split and net */}
              {agentPct !== null && <Dl label="My Split %" value={`${agentPct}%`} />}
              {agentNet !== null && (
                <Dl
                  label={commissionIsEstimated ? 'Est. Net to Me' : 'Net to Me'}
                  value={`$${Number(agentNet).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                />
              )}
            </Grid3>
          </CardContent>
        </Card>
      )}

      {/* ── Status & Transaction Type ──────────────────────────────────────── */}
      <SectionCard title="Transaction Status" icon={<Info className="h-4 w-4" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ESelect label="Status" name="status" value={f.status} onChange={setField} options={[
            { value: 'active', label: 'Active' },
            { value: 'pending', label: 'Pending' },
            { value: 'coming_soon', label: 'Coming Soon' },
            { value: 'temp_off_market', label: 'Temp Off Market' },
            { value: 'closed', label: 'Closed' },
            { value: 'expired', label: 'Expired' },
            { value: 'canceled', label: 'Canceled' },
          ]} />
          <ESwitch label="Working with a TC" name="workingWithTc" value={Boolean(f.workingWithTc)} onChange={setField} />
        </div>
      </SectionCard>

      {/* ── Property Details ───────────────────────────────────────────────── */}
      <SectionCard title="Property Details" icon={<Home className="h-4 w-4" />}>
        <div className="space-y-4">
          <EInput label="Property Address" name="propertyAddress" value={f.propertyAddress} onChange={setField} placeholder="123 Main St, City, State ZIP" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <EInput label="List Price" name="listPrice" value={f.listPrice} onChange={setField} type="number" placeholder="0" />
            <EInput label="Sale Price" name="salePrice" value={f.salePrice} onChange={setField} type="number" placeholder="0" />
          </div>
        </div>
      </SectionCard>

      {/* ── Key Dates ─────────────────────────────────────────────────────── */}
      <SectionCard title="Key Dates" icon={<Calendar className="h-4 w-4" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {isListing && <EInput label="Listing Date" name="listingDate" value={f.listingDate} onChange={setField} type="date" />}
          {isListing && <EInput label="Listing Expiration" name="listingExpirationDate" value={f.listingExpirationDate} onChange={setField} type="date" />}
          <EInput label="Contract Date" name="contractDate" value={f.contractDate} onChange={setField} type="date" />
          <EInput label="Option Expiration" name="optionExpiration" value={f.optionExpiration} onChange={setField} type="date" />
          <EInput label="Inspection Deadline" name="inspectionDeadline" value={f.inspectionDeadline} onChange={setField} type="date" />
          <EInput label="Appraisal Deadline" name="appraisalDeadline" value={f.appraisalDeadline} onChange={setField} type="date" />
          <EInput label="Survey Deadline" name="surveyDeadline" value={f.surveyDeadline} onChange={setField} type="date" />
          <EInput label="Title Deadline" name="titleDeadline" value={f.titleDeadline} onChange={setField} type="date" />
          <EInput label="Loan Application Deadline" name="loanApplicationDeadline" value={f.loanApplicationDeadline} onChange={setField} type="date" />
          <EInput label="Final Loan Commitment" name="finalLoanCommitmentDeadline" value={f.finalLoanCommitmentDeadline} onChange={setField} type="date" />
          <EInput label="Projected Close Date" name="projectedCloseDate" value={f.projectedCloseDate} onChange={setField} type="date" />
          <EInput label="Closing Date" name="closingDate" value={f.closingDate} onChange={setField} type="date" />
          <EInput label="Closed Date" name="closedDate" value={f.closedDate} onChange={setField} type="date" />
        </div>
      </SectionCard>

      {/* ── Seller Info ────────────────────────────────────────────────────── */}
      {(isListing || side === 'dual') && (
        <SectionCard title="Seller Information" icon={<User className="h-4 w-4" />}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <EInput label="Seller Name" name="sellerName" value={f.sellerName} onChange={setField} />
              <EInput label="Seller Email" name="sellerEmail" value={f.sellerEmail} onChange={setField} type="email" />
              <EInput label="Seller Phone" name="sellerPhone" value={f.sellerPhone} onChange={setField} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <EInput label="Seller 2 Name" name="seller2Name" value={f.seller2Name} onChange={setField} />
              <EInput label="Seller 2 Email" name="seller2Email" value={f.seller2Email} onChange={setField} type="email" />
              <EInput label="Seller 2 Phone" name="seller2Phone" value={f.seller2Phone} onChange={setField} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <EInput label="Seller 3 Name" name="seller3Name" value={f.seller3Name || ''} onChange={setField} />
              <EInput label="Seller 3 Email" name="seller3Email" value={f.seller3Email || ''} onChange={setField} type="email" />
              <EInput label="Seller 3 Phone" name="seller3Phone" value={f.seller3Phone || ''} onChange={setField} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <EInput label="Seller 4 Name" name="seller4Name" value={f.seller4Name || ''} onChange={setField} />
              <EInput label="Seller 4 Email" name="seller4Email" value={f.seller4Email || ''} onChange={setField} type="email" />
              <EInput label="Seller 4 Phone" name="seller4Phone" value={f.seller4Phone || ''} onChange={setField} />
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── Buyer Info ─────────────────────────────────────────────────────── */}
      {(isBuyer || side === 'dual' || f.buyerName) && (
        <SectionCard title="Buyer Information" icon={<User className="h-4 w-4" />}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <EInput label="Buyer Name" name="buyerName" value={f.buyerName} onChange={setField} />
              <EInput label="Buyer Email" name="buyerEmail" value={f.buyerEmail} onChange={setField} type="email" />
              <EInput label="Buyer Phone" name="buyerPhone" value={f.buyerPhone} onChange={setField} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <EInput label="Buyer 2 Name" name="buyer2Name" value={f.buyer2Name} onChange={setField} />
              <EInput label="Buyer 2 Email" name="buyer2Email" value={f.buyer2Email} onChange={setField} type="email" />
              <EInput label="Buyer 2 Phone" name="buyer2Phone" value={f.buyer2Phone} onChange={setField} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <EInput label="Buyer 3 Name" name="buyer3Name" value={f.buyer3Name || ''} onChange={setField} />
              <EInput label="Buyer 3 Email" name="buyer3Email" value={f.buyer3Email || ''} onChange={setField} type="email" />
              <EInput label="Buyer 3 Phone" name="buyer3Phone" value={f.buyer3Phone || ''} onChange={setField} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <EInput label="Buyer 4 Name" name="buyer4Name" value={f.buyer4Name || ''} onChange={setField} />
              <EInput label="Buyer 4 Email" name="buyer4Email" value={f.buyer4Email || ''} onChange={setField} type="email" />
              <EInput label="Buyer 4 Phone" name="buyer4Phone" value={f.buyer4Phone || ''} onChange={setField} />
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── Cooperating Agent ─────────────────────────────────────────────── */}
      <SectionCard title="Cooperating Agent" icon={<Users className="h-4 w-4" />} defaultCollapsed={!f.otherAgentName}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <EInput label="Agent Name" name="otherAgentName" value={f.otherAgentName} onChange={setField} />
          <EInput label="Brokerage" name="otherAgentBrokerage" value={f.otherAgentBrokerage} onChange={setField} />
          <EInput label="Email" name="otherAgentEmail" value={f.otherAgentEmail} onChange={setField} type="email" />
          <EInput label="Phone" name="otherAgentPhone" value={f.otherAgentPhone} onChange={setField} />
        </div>
      </SectionCard>

      {/* ── Lender ────────────────────────────────────────────────────────── */}
      <SectionCard title="Lender / Mortgage" icon={<Building2 className="h-4 w-4" />} defaultCollapsed={!f.mortgageCompany}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <EInput label="Mortgage Company" name="mortgageCompany" value={f.mortgageCompany} onChange={setField} />
          <EInput label="Lender Office" name="lenderOffice" value={f.lenderOffice} onChange={setField} />
          <EInput label="Loan Officer" name="loanOfficer" value={f.loanOfficer} onChange={setField} />
          <EInput label="Loan Officer Email" name="loanOfficerEmail" value={f.loanOfficerEmail} onChange={setField} type="email" />
          <EInput label="Loan Officer Phone" name="loanOfficerPhone" value={f.loanOfficerPhone} onChange={setField} />
        </div>
      </SectionCard>

      {/* ── Title ─────────────────────────────────────────────────────────── */}
      <SectionCard title="Title Company" icon={<FileText className="h-4 w-4" />} defaultCollapsed={!f.titleCompany}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <EInput label="Title Company" name="titleCompany" value={f.titleCompany} onChange={setField} />
          <EInput label="Title Office" name="titleOffice" value={f.titleOffice} onChange={setField} />
          <EInput label="Title Officer" name="titleOfficer" value={f.titleOfficer} onChange={setField} />
          <EInput label="Title Attorney" name="titleAttorney" value={f.titleAttorney} onChange={setField} />
          <EInput label="Title Officer Email" name="titleOfficerEmail" value={f.titleOfficerEmail} onChange={setField} type="email" />
          <EInput label="Title Officer Phone" name="titleOfficerPhone" value={f.titleOfficerPhone} onChange={setField} />
        </div>
      </SectionCard>

      {/* ── Financial Details ─────────────────────────────────────────────── */}
      <SectionCard title="Financial Details" icon={<DollarSign className="h-4 w-4" />} defaultCollapsed={!f.earnestMoney}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <EInput label="Earnest Money" name="earnestMoney" value={f.earnestMoney} onChange={setField} type="number" />
          <ESelect label="Deposit Holder" name="depositHolder" value={f.depositHolder} onChange={setField} options={[
            { value: 'listing_brokerage', label: 'Listing Brokerage' },
            { value: 'title_company', label: 'Title Company' },
            { value: 'other', label: 'Other' },
          ]} />
          {f.depositHolder === 'other' && (
            <EInput label="Deposit Holder (Other)" name="depositHolderOther" value={f.depositHolderOther} onChange={setField} />
          )}
          <EInput label="Buyer Closing Costs Paid by Seller" name="buyerClosingCostTotal" value={f.buyerClosingCostTotal} onChange={setField} type="number" />
        </div>
      </SectionCard>

      {/* ── MLS Information ───────────────────────────────────────────────── */}
      {isListing && (
        <SectionCard title="MLS Information" icon={<Info className="h-4 w-4" />} defaultCollapsed={!f.mlsNumber}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <EInput label="MLS Number" name="mlsNumber" value={f.mlsNumber || ''} onChange={setField} />
            </div>
            <ETextarea label="MLS Description" name="mlsDescription" value={f.mlsDescription || ''} onChange={setField} placeholder="Public MLS listing description..." />
          </div>
        </SectionCard>
      )}

      {/* ── Commercial Details ─────────────────────────────────────────────── */}
      {(f.dealType === 'commercial_sale' || f.dealType === 'commercial_lease') && (
        <SectionCard title="Commercial Details" icon={<Building2 className="h-4 w-4" />}>
          <div className="space-y-4">
            {f.dealType === 'commercial_sale' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox id="commercialForSale" checked={Boolean(f.commercialForSale)} onCheckedChange={v => setField('commercialForSale', v)} />
                  <label htmlFor="commercialForSale" className="text-sm cursor-pointer">Commercial For Sale</label>
                </div>
                <EInput label="Commercial Sale Price ($)" name="commercialSalePrice" value={f.commercialSalePrice || ''} onChange={setField} type="number" />
              </div>
            )}
            {f.dealType === 'commercial_lease' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox id="commercialForLease" checked={Boolean(f.commercialForLease)} onCheckedChange={v => setField('commercialForLease', v)} />
                    <label htmlFor="commercialForLease" className="text-sm cursor-pointer">Commercial For Lease</label>
                  </div>
                  <EInput label="Monthly Rent ($)" name="commercialLeaseMonthly" value={f.commercialLeaseMonthly || ''} onChange={setField} type="number" />
                  <EInput label="Price Per Sqft ($)" name="commercialLeasePricePerSqft" value={f.commercialLeasePricePerSqft || ''} onChange={setField} type="number" />
                  <EInput label="Lease Term (months)" name="commercialLeaseTerm" value={f.commercialLeaseTerm || ''} onChange={setField} type="number" />
                  <EInput label="Total Lease Value ($)" name="commercialTotalLeaseValue" value={f.commercialTotalLeaseValue || ''} onChange={setField} type="number" />
                  <EInput label="Lease GCI ($)" name="commercialLeaseGci" value={f.commercialLeaseGci || ''} onChange={setField} type="number" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <ESelect label="Commission Mode" name="commercialLeaseCommissionMode" value={f.commercialLeaseCommissionMode || ''} onChange={setField} options={[
                    { value: 'percent', label: 'Percent' },
                    { value: 'flat', label: 'Flat Dollar' },
                  ]} />
                  <EInput label="Commission (%)" name="commercialLeaseCommissionPct" value={f.commercialLeaseCommissionPct || ''} onChange={setField} type="number" />
                  <EInput label="Commission Flat ($)" name="commercialLeaseCommissionFlat" value={f.commercialLeaseCommissionFlat || ''} onChange={setField} type="number" />
                  <EInput label="Effective Commission (%)" name="commercialLeaseEffectivePct" value={f.commercialLeaseEffectivePct || ''} onChange={setField} type="number" />
                </div>
              </>
            )}
          </div>
        </SectionCard>
      )}

      {/* ── Referrals ────────────────────────────────────────────────────────── */}
      <SectionCard title="Referrals" icon={<Users className="h-4 w-4" />} defaultCollapsed={!f.hasOutboundReferral && !f.hasInboundReferral}>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox id="hasOutboundReferral" checked={Boolean(f.hasOutboundReferral)} onCheckedChange={v => setField('hasOutboundReferral', v)} />
            <label htmlFor="hasOutboundReferral" className="text-sm cursor-pointer font-medium">Outbound Referral Fee</label>
          </div>
          {f.hasOutboundReferral && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-6">
              <EInput label="Referral % (of GCI)" name="outboundReferralPercent" value={f.outboundReferralPercent || ''} onChange={setField} type="number" />
              <EInput label="Referral Dollar Amount" name="outboundReferralDollar" value={f.outboundReferralDollar || ''} onChange={setField} type="number" />
              <EInput label="Outside Broker / Company" name="outboundReferralBrokerName" value={f.outboundReferralBrokerName || ''} onChange={setField} />
              <EInput label="Referring Agent / Contact" name="outboundReferralContactName" value={f.outboundReferralContactName || ''} onChange={setField} />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Checkbox id="hasInboundReferral" checked={Boolean(f.hasInboundReferral)} onCheckedChange={v => setField('hasInboundReferral', v)} />
            <label htmlFor="hasInboundReferral" className="text-sm cursor-pointer font-medium">Inbound Referral</label>
          </div>
          {f.hasInboundReferral && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-6">
              <EInput label="Referring Agent Name" name="inboundReferralAgentName" value={f.inboundReferralAgentName || ''} onChange={setField} />
              <EInput label="Referring Brokerage" name="inboundReferralBrokerage" value={f.inboundReferralBrokerage || ''} onChange={setField} />
              <EInput label="Inbound Fee (%)" name="inboundReferralFeePercent" value={f.inboundReferralFeePercent || ''} onChange={setField} type="number" />
              <EInput label="Inbound Fee ($)" name="inboundReferralFeeDollar" value={f.inboundReferralFeeDollar || ''} onChange={setField} type="number" />
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── Buyer Inspection ──────────────────────────────────────────────── */}
      {isBuyer && (
        <SectionCard title="Buyer Inspection" icon={<Wrench className="h-4 w-4" />} defaultCollapsed={!f.inspectionOrdered || f.inspectionOrdered === 'no'}>
          <div className="space-y-4">
            <ESelect label="Inspection Ordered?" name="inspectionOrdered" value={f.inspectionOrdered} onChange={setField} options={[
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
              { value: 'waived', label: 'Waived' },
            ]} />
            {f.inspectionOrdered === 'yes' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <EInput label="Target Inspection Date" name="targetInspectionDate" value={f.targetInspectionDate} onChange={setField} type="date" />
                  <EInput label="Inspector Name" name="inspectorName" value={f.inspectorName} onChange={setField} />
                </div>
                <ECheckboxGroup label="Inspection Types" name="inspectionTypes"
                  options={INSPECTION_TYPE_OPTIONS} value={f.inspectionTypes} onChange={setField} />
                {/* Scheduling status badge */}
                {f.tcScheduleInspections && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Status:</span>
                    {f.tcScheduleInspections === 'already_scheduled' && (
                      <span className="inline-flex items-center rounded-full bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-0.5">✅ Already Scheduled</span>
                    )}
                    {(f.tcScheduleInspections === 'yes' || f.tcScheduleInspections === 'no') && (
                      <span className="inline-flex items-center rounded-full bg-yellow-100 text-yellow-800 text-xs font-semibold px-2.5 py-0.5">📋 TC / Staff to Schedule</span>
                    )}
                    {f.tcScheduleInspections === 'other' && (
                      <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-700 text-xs font-semibold px-2.5 py-0.5">📝 See Notes</span>
                    )}
                  </div>
                )}
                <ESelect label="Inspection Scheduling Status" name="tcScheduleInspections" value={f.tcScheduleInspections} onChange={setField} options={[
                  { value: 'already_scheduled', label: '✅ Already Scheduled — I contacted the inspector' },
                  { value: 'yes', label: '📋 TC / Staff to Schedule' },
                  { value: 'other', label: '📝 Other / Notes' },
                ]} />
              </>
            )}
          </div>
        </SectionCard>
      )}

      {/* ── Pre-Listing Inspection ────────────────────────────────────────── */}
      {isListing && (
        <SectionCard title="Pre-Listing Inspection" icon={<Wrench className="h-4 w-4" />} defaultCollapsed={!f.preListingInspectionOrdered || f.preListingInspectionOrdered === 'no'}>
          <div className="space-y-4">
            <ESelect label="Pre-Listing Inspection Ordered?" name="preListingInspectionOrdered" value={f.preListingInspectionOrdered} onChange={setField} options={[
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
            ]} />
            {f.preListingInspectionOrdered === 'yes' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <EInput label="Target Inspection Date" name="preListingTargetInspectionDate" value={f.preListingTargetInspectionDate} onChange={setField} type="date" />
                  <EInput label="Inspector Name" name="preListingInspectorName" value={f.preListingInspectorName} onChange={setField} />
                </div>
                <ECheckboxGroup label="Inspection Types" name="preListingInspectionTypes"
                  options={INSPECTION_TYPE_OPTIONS} value={f.preListingInspectionTypes} onChange={setField} />
                {/* Scheduling status badge */}
                {f.preListingTcScheduleInspections && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Status:</span>
                    {f.preListingTcScheduleInspections === 'already_scheduled' && (
                      <span className="inline-flex items-center rounded-full bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-0.5">✅ Already Scheduled</span>
                    )}
                    {(f.preListingTcScheduleInspections === 'yes' || f.preListingTcScheduleInspections === 'no') && (
                      <span className="inline-flex items-center rounded-full bg-yellow-100 text-yellow-800 text-xs font-semibold px-2.5 py-0.5">📋 TC / Staff to Schedule</span>
                    )}
                    {f.preListingTcScheduleInspections === 'other' && (
                      <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-700 text-xs font-semibold px-2.5 py-0.5">📝 See Notes</span>
                    )}
                  </div>
                )}
                <ESelect label="Pre-Listing Inspection Scheduling Status" name="preListingTcScheduleInspections" value={f.preListingTcScheduleInspections} onChange={setField} options={[
                  { value: 'already_scheduled', label: '✅ Already Scheduled — I contacted the inspector' },
                  { value: 'yes', label: '📋 TC / Staff to Schedule' },
                  { value: 'other', label: '📝 Other / Notes' },
                ]} />
              </>
            )}
          </div>
        </SectionCard>
      )}

      {/* ── Media Order ───────────────────────────────────────────────────── */}
      {isListing && (
        <SectionCard title="Media Order" icon={<Camera className="h-4 w-4" />} defaultCollapsed={!f.mediaRequested}>
          <div className="space-y-4">
            <ESwitch label="Media Requested" name="mediaRequested" value={Boolean(f.mediaRequested)} onChange={setField} />
            {f.mediaRequested && (
              <>
                <ECheckboxGroup label="Media Types" name="mediaTypes"
                  options={MEDIA_TYPE_OPTIONS} value={f.mediaTypes} onChange={setField} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <EInput label="Requested Date" name="mediaRequestedDate" value={f.mediaRequestedDate} onChange={setField} type="date" />
                </div>
                <ETextarea label="Media Notes" name="mediaNotes" value={f.mediaNotes} onChange={setField} />
              </>
            )}
          </div>
        </SectionCard>
      )}

      {/* ── Sign Order ────────────────────────────────────────────────────── */}
      {isListing && (
        <SectionCard title="Sign Order" icon={<MapPin className="h-4 w-4" />} defaultCollapsed={!f.signOrderRequested}>
          <div className="space-y-4">
            <ESwitch label="Sign Order Requested" name="signOrderRequested" value={Boolean(f.signOrderRequested)} onChange={setField} />
            {f.signOrderRequested && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ESelect label="Sign Service Type" name="signServiceType" value={f.signServiceType} onChange={setField}
                    options={SIGN_SERVICE_OPTIONS.map(o => ({ value: o, label: o }))} />
                  <EInput label="Install Date" name="signInstallDate" value={f.signInstallDate} onChange={setField} type="date" />
                  <EInput label="Owner / Occupant Name" name="signOwnerName" value={f.signOwnerName} onChange={setField} />
                </div>
                <ECheckboxGroup label="Sign Riders" name="signRider"
                  options={['Open House', 'For Sale', 'Sold', 'Under Contract', 'Price Reduced']} value={f.signRider} onChange={setField} />
                <ECheckboxGroup label="Additional Options" name="signAdditionalOptions"
                  options={SIGN_ADDITIONAL_OPTIONS} value={f.signAdditionalOptions} onChange={setField} />
                {(f.signAdditionalOptions?.includes('Text2 Rider') || f.signAdditionalOptions?.includes('Phone# Rider EXT')) && (
                  <EInput label="Phone# Rider EXT" name="signRiderExt" value={f.signRiderExt} onChange={setField} placeholder="Extension number..." />
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <EInput label="Requested Date of Service" name="signRequestedDate" value={f.signRequestedDate} onChange={setField} type="date" />
                </div>
                <ETextarea label="Special Requests" name="signSpecialRequests" value={f.signSpecialRequests} onChange={setField} />
              </>
            )}
          </div>
        </SectionCard>
      )}

      {/* ── ShowingTime ───────────────────────────────────────────────────── */}
      {isListing && (
        <SectionCard title="ShowingTime Setup" icon={<Eye className="h-4 w-4" />} defaultCollapsed={!f.showingTimeRequested}>
          <div className="space-y-4">
            <ESwitch label="ShowingTime Requested" name="showingTimeRequested" value={Boolean(f.showingTimeRequested)} onChange={setField} />
            {f.showingTimeRequested && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <ESelect label="Appointment Type" name="showingApptType" value={f.showingApptType} onChange={setField} options={[
                    { value: 'appointment_required', label: 'Appointment Required' },
                    { value: 'go_and_show', label: 'Go and Show' },
                    { value: 'call_first', label: 'Call First' },
                  ]} />
                  <ESelect label="New or Change" name="showingNewOrChange" value={f.showingNewOrChange} onChange={setField} options={[
                    { value: 'new', label: 'New Setup' },
                    { value: 'change', label: 'Change Existing' },
                  ]} />
                  <ESelect label="Appointment Handling" name="showingApptHandling" value={f.showingApptHandling} onChange={setField} options={[
                    { value: 'auto_approve', label: 'Auto-Approve' },
                    { value: 'call_to_confirm', label: 'Call to Confirm' },
                    { value: 'text_to_confirm', label: 'Text to Confirm' },
                  ]} />
                  <EInput label="Lead Time Required" name="showingLeadTimeRequired" value={f.showingLeadTimeRequired} onChange={setField} />
                  <EInput label="Lead Time Suggested" name="showingLeadTimeSuggested" value={f.showingLeadTimeSuggested} onChange={setField} />
                  <EInput label="Max Appointment Length" name="showingMaxApptLength" value={f.showingMaxApptLength} onChange={setField} />
                  <ESelect label="Virtual Preference" name="showingVirtualPreference" value={f.showingVirtualPreference} onChange={setField} options={[
                    { value: 'yes', label: 'Yes — allow virtual' },
                    { value: 'no', label: 'No — in-person only' },
                  ]} />
                </div>
                <div className="flex flex-wrap gap-6">
                  <ESwitch label="Allow Appointment Overlaps" name="showingApptOverlaps" value={Boolean(f.showingApptOverlaps)} onChange={setField} />
                  <ESwitch label="No Same-Day Appointments" name="showingNoSameDayAppts" value={Boolean(f.showingNoSameDayAppts)} onChange={setField} />
                  <ESwitch label="Share Agent Info with Showing Agents" name="showingShareAgentInfo" value={Boolean(f.showingShareAgentInfo)} onChange={setField} />
                </div>
                <Separator />
                <p className="text-sm font-medium">Access Information</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <ESelect label="Access Type" name="showingAccessType" value={f.showingAccessType} onChange={setField} options={[
                    { value: 'lockbox', label: 'Lockbox' },
                    { value: 'call_agent', label: 'Call Agent' },
                    { value: 'call_owner', label: 'Call Owner' },
                    { value: 'key_at_office', label: 'Key at Office' },
                    { value: 'other', label: 'Other' },
                  ]} />
                  <EInput label="Access Door" name="showingAccessDoor" value={f.showingAccessDoor} onChange={setField} placeholder="Front, Back, Garage..." />
                  <EInput label="Lockbox Code" name="showingLockboxCode" value={f.showingLockboxCode} onChange={setField} />
                  <EInput label="Alarm Code" name="showingAlarmCode" value={f.showingAlarmCode} onChange={setField} />
                  <EInput label="ARM Code" name="showingArmCode" value={f.showingArmCode} onChange={setField} />
                  <EInput label="Disarm Code" name="showingDisarmCode" value={f.showingDisarmCode} onChange={setField} />
                  <EInput label="Passcode / Gate Code" name="showingPasscode" value={f.showingPasscode} onChange={setField} />
                </div>
                <ETextarea label="Alarm Notes" name="showingAlarmNotes" value={f.showingAlarmNotes} onChange={setField} />
                <ETextarea label="Access Notes" name="showingAccessNotes" value={f.showingAccessNotes} onChange={setField} />
                <Separator />
                <p className="text-sm font-medium">Call Order — Contact 1</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <EInput label="Name" name="showingCallOrder1Name" value={f.showingCallOrder1Name} onChange={setField} />
                  <EInput label="Mobile" name="showingCallOrder1Mobile" value={f.showingCallOrder1Mobile} onChange={setField} />
                  <EInput label="Email" name="showingCallOrder1Email" value={f.showingCallOrder1Email} onChange={setField} type="email" />
                </div>
                <p className="text-sm font-medium">Call Order — Contact 2</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <EInput label="Name" name="showingCallOrder2Name" value={f.showingCallOrder2Name} onChange={setField} />
                  <EInput label="Mobile" name="showingCallOrder2Mobile" value={f.showingCallOrder2Mobile} onChange={setField} />
                  <EInput label="Alt Phone" name="showingCallOrder2AltPhone" value={f.showingCallOrder2AltPhone} onChange={setField} />
                  <EInput label="Email" name="showingCallOrder2Email" value={f.showingCallOrder2Email} onChange={setField} type="email" />
                  <ESelect label="Type" name="showingCallOrder2Type" value={f.showingCallOrder2Type} onChange={setField} options={[
                    { value: 'agent', label: 'Agent' },
                    { value: 'owner', label: 'Owner' },
                    { value: 'tenant', label: 'Tenant' },
                    { value: 'other', label: 'Other' },
                  ]} />
                </div>
                <div className="flex flex-wrap gap-6">
                  <ESwitch label="Confirm Appointments" name="showingCallOrder2Confirm" value={Boolean(f.showingCallOrder2Confirm?.length)} onChange={(n, v) => setField(n, v ? ['yes'] : [])} />
                  <ESwitch label="Notify of Appointments" name="showingCallOrder2Notify" value={Boolean(f.showingCallOrder2Notify?.length)} onChange={(n, v) => setField(n, v ? ['yes'] : [])} />
                </div>
                <p className="text-sm font-medium">Call Order — Contact 3</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <EInput label="Name" name="showingCallOrder3Name" value={f.showingCallOrder3Name} onChange={setField} />
                  <EInput label="Mobile" name="showingCallOrder3Mobile" value={f.showingCallOrder3Mobile} onChange={setField} />
                  <EInput label="Alt Phone" name="showingCallOrder3AltPhone" value={f.showingCallOrder3AltPhone} onChange={setField} />
                  <EInput label="Email" name="showingCallOrder3Email" value={f.showingCallOrder3Email} onChange={setField} type="email" />
                  <ESelect label="Type" name="showingCallOrder3Type" value={f.showingCallOrder3Type} onChange={setField} options={[
                    { value: 'agent', label: 'Agent' },
                    { value: 'owner', label: 'Owner' },
                    { value: 'tenant', label: 'Tenant' },
                    { value: 'other', label: 'Other' },
                  ]} />
                </div>
                <div className="flex flex-wrap gap-6">
                  <ESwitch label="Confirm Appointments" name="showingCallOrder3Confirm" value={Boolean(f.showingCallOrder3Confirm?.length)} onChange={(n, v) => setField(n, v ? ['yes'] : [])} />
                  <ESwitch label="Notify of Appointments" name="showingCallOrder3Notify" value={Boolean(f.showingCallOrder3Notify?.length)} onChange={(n, v) => setField(n, v ? ['yes'] : [])} />
                </div>
                <ECheckboxGroup label="Notes to Showing Agent" name="showingNotesToAgent"
                  options={SHOWING_NOTES_TO_AGENT_OPTIONS} value={f.showingNotesToAgent} onChange={setField} />
                {f.showingNotesToAgent?.includes('Other') && (
                  <EInput label="Other Notes to Showing Agent" name="showingNotesToAgentOther" value={f.showingNotesToAgentOther} onChange={setField} placeholder="Describe..." />
                )}
                <ETextarea label="Notes to Staff" name="showingNotesToStaff" value={f.showingNotesToStaff} onChange={setField} />
              </>
            )}
          </div>
        </SectionCard>
      )}

      {/* ── Additional Transaction Info ────────────────────────────────────── */}
      <SectionCard title="Additional Transaction Info" icon={<Info className="h-4 w-4" />} defaultCollapsed={!f.warrantyAtClosing && !f.occupancyAgreement && !f.shortageInCommission && !f.txComplianceFee}>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <ESelect label="Warranty at Closing?" name="warrantyAtClosing" value={f.warrantyAtClosing} onChange={setField} options={[
            { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' },
          ]} />
          {f.warrantyAtClosing === 'yes' && (
            <>
              <EInput label="Warranty Amount" name="warrantyAmount" value={f.warrantyAmount} onChange={setField} type="number" />
              <ESelect label="Warranty Paid By" name="warrantyPaidBy" value={f.warrantyPaidBy} onChange={setField} options={[
                { value: 'seller', label: 'Seller' }, { value: 'buyer', label: 'Buyer' },
              ]} />
            </>
          )}
          <ESelect label="Shortage in Commission?" name="shortageInCommission" value={f.shortageInCommission} onChange={setField} options={[
            { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' },
          ]} />
          {f.shortageInCommission === 'yes' && (
            <EInput label="Shortage Amount" name="shortageAmount" value={f.shortageAmount} onChange={setField} type="number" />
          )}
          <ESelect label="Occupancy Agreement?" name="occupancyAgreement" value={f.occupancyAgreement} onChange={setField} options={[
            { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' },
          ]} />
          {f.occupancyAgreement === 'yes' && (
            <EInput label="Occupancy Dates" name="occupancyDates" value={f.occupancyDates} onChange={setField} placeholder="e.g. 3 days post-close" />
          )}
          <ESelect label="Transaction Compliance Fee?" name="txComplianceFee" value={f.txComplianceFee} onChange={setField} options={[
            { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' },
          ]} />
          {f.txComplianceFee === 'yes' && (
            <>
              <EInput label="Compliance Fee Amount" name="txComplianceFeeAmount" value={f.txComplianceFeeAmount} onChange={setField} type="number" />
              <ESelect label="Compliance Fee Paid By" name="txComplianceFeePaidBy" value={f.txComplianceFeePaidBy} onChange={setField} options={[
                { value: 'seller', label: 'Seller' }, { value: 'buyer', label: 'Buyer' },
              ]} />
            </>
          )}
        </div>
      </SectionCard>

      {/* ── Staging Consult ──────────────────────────────────────────── */}
      {(transaction?.stagingConsultRequested || transaction?.stagingServiceType || transaction?.stagingConsultationDate || transaction?.stagingStagerName) && (
        <SectionCard title="Staging Consult" icon={<Paintbrush className="h-4 w-4" />}>
          {/* Scheduling status badge */}
          <div className="mb-3">
            {transaction?.stagingRequestSentAt ? (
              <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5">🔵 Request Sent to Stager</span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-yellow-100 text-yellow-800 text-xs font-semibold px-2.5 py-0.5">📋 TC / Staff to Coordinate</span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {transaction.stagingStagerName && <Dl label="Stager" value={transaction.stagingStagerName} />}
            {transaction.stagingStagerEmail && <Dl label="Stager Email" value={transaction.stagingStagerEmail} />}
            {transaction.stagingServiceType && <Dl label="Service Type" value={transaction.stagingServiceType} />}
            {transaction.stagingPaymentMethod && <Dl label="Payment Method" value={transaction.stagingPaymentMethod} />}
            {transaction.stagingCoordinateWith && <Dl label="Coordinate With" value={transaction.stagingCoordinateWith} />}
            {transaction.stagingPhotographerDate && <Dl label="Photographer Date" value={transaction.stagingPhotographerDate} />}
            {transaction.stagingConsultationDate && <Dl label="Consultation Date" value={transaction.stagingConsultationDate} />}
            {transaction.stagingConsultationTime && <Dl label="Consultation Time" value={transaction.stagingConsultationTime} />}
            {transaction.stagingCurrentlyOnMarket && <Dl label="Currently on Market" value={transaction.stagingCurrentlyOnMarket} />}
            {transaction.stagingTargetedMarketDate && <Dl label="Targeted Market Date" value={transaction.stagingTargetedMarketDate} />}
            {transaction.stagingHomeStyle && <Dl label="Home Style" value={transaction.stagingHomeStyle} />}
            {transaction.stagingOccupancy && <Dl label="Occupancy" value={transaction.stagingOccupancy} />}
            {transaction.stagingReasonForSelling && <Dl label="Reason for Selling" value={transaction.stagingReasonForSelling} />}
            {transaction.stagingRequestSentAt && <Dl label="Request Sent" value={transaction.stagingRequestSentAt} />}
          </div>
          {transaction.stagingSpecialNotes && (
            <div className="mt-3">
              <p className="text-xs text-muted-foreground">Special Notes</p>
              <p className="text-sm mt-0.5">{transaction.stagingSpecialNotes}</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground italic mt-2">Staging consult submitted with this transaction. Contact your TC or staff to update staging details.</p>
        </SectionCard>
      )}

      {/* ── Notes ─────────────────────────────────────────────────────────── */}
      <SectionCard title="Notes" icon={<FileText className="h-4 w-4" />}>
        <div className="space-y-4">
          <ETextarea label="Transaction Notes" name="notes" value={f.notes} onChange={setField} placeholder="Add notes about this transaction..." />
          <ETextarea label="Additional Comments" name="additionalComments" value={f.additionalComments} onChange={setField} />
        </div>
      </SectionCard>

      {/* ── Documents ─────────────────────────────────────────────────────── */}
      <SectionCard title="Documents" icon={<FileText className="h-4 w-4" />}>
        <div className="space-y-3">
          {/* Upload button */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={docUploading}
              onClick={() => docFileRef.current?.click()}
            >
              {docUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {docUploading ? 'Uploading…' : 'Upload Document'}
            </Button>
            <input
              ref={docFileRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.heic"
              className="hidden"
              onChange={e => handleDocUpload(e.target.files)}
            />
            {docs.some(d => d.archived) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground text-xs"
                onClick={() => setShowArchived(v => !v)}
              >
                {showArchived ? 'Hide Archived' : `Show Archived (${docs.filter(d => d.archived).length})`}
              </Button>
            )}
          </div>

          {/* Active documents */}
          {docs.filter(d => !d.archived).length === 0 && (
            <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
          )}
          {docs.filter(d => !d.archived).map((doc, idx) => (
            <div key={doc.storagePath || idx} className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <a href={doc.url} target="_blank" rel="noopener noreferrer"
                  className="text-sm font-medium truncate hover:underline text-primary flex items-center gap-1">
                  {doc.name}<ExternalLink className="h-3 w-3 flex-shrink-0" />
                </a>
                {doc.uploadedAt && <p className="text-xs text-muted-foreground">{formatDate(doc.uploadedAt)}</p>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  type="button" variant="ghost" size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => handleDocArchive(doc.storagePath)}
                  title="Archive document"
                >
                  Archive
                </Button>
              </div>
            </div>
          ))}

          {/* Archived documents (collapsed by default) */}
          {showArchived && docs.filter(d => d.archived).map((doc, idx) => (
            <div key={doc.storagePath || idx} className="flex items-center gap-3 rounded-lg border border-dashed bg-muted/20 px-3 py-2 opacity-60">
              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <a href={doc.url} target="_blank" rel="noopener noreferrer"
                  className="text-sm font-medium truncate hover:underline text-muted-foreground flex items-center gap-1">
                  {doc.name}<ExternalLink className="h-3 w-3 flex-shrink-0" />
                </a>
                {doc.uploadedAt && <p className="text-xs text-muted-foreground">{formatDate(doc.uploadedAt)} — Archived</p>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  type="button" variant="ghost" size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => handleDocArchive(doc.storagePath)}
                  title="Restore document"
                >
                  Restore
                </Button>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── Agent Tasks ───────────────────────────────────────────────────── */}
      {totalCount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              My Tasks
              <Badge variant="outline" className="ml-auto text-xs">{completedCount}/{totalCount} — {pct}%</Badge>
            </CardTitle>
            <div className="w-full bg-muted rounded-full h-1.5 mt-2">
              <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {phaseOrder.filter(ph => phases[ph]?.length > 0).map(ph => (
              <div key={ph}>
                <button
                  onClick={() => togglePhase(ph)}
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground w-full text-left mb-2"
                >
                  {collapsedPhases[ph] ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                  {PHASE_LABELS[ph] || ph}
                  <span className="ml-auto text-xs">
                    {phases[ph].filter(t => t.completed).length}/{phases[ph].length}
                  </span>
                </button>
                {!collapsedPhases[ph] && (
                  <div className="space-y-2 pl-4">
                    {phases[ph].map(task => (
                      <label key={task.id} className="flex items-start gap-3 cursor-pointer group">
                        <Checkbox
                          checked={task.completed}
                          onCheckedChange={() => handleToggleTask(task)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <span className={cn('text-sm', task.completed && 'line-through text-muted-foreground')}>
                            {task.label}
                          </span>
                          {task.dueDate && !task.completed && (
                            <p className="text-xs text-muted-foreground mt-0.5">Due: {formatDate(task.dueDate)}</p>
                          )}
                          {task.completed && task.completedAt && (
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3 text-green-500" />
                              Completed {formatDate(task.completedAt)}
                            </p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Sticky Save Bar ───────────────────────────────────────────────── */}
      {dirty && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t px-4 py-3 flex items-center justify-between gap-4 shadow-lg">
          <p className="text-sm text-muted-foreground">You have unsaved changes</p>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      )}
    </div>
  );
}
