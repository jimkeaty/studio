'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, use } from 'react';
import { useUser } from '@/firebase';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft, CheckCircle2, ClipboardList, AlertTriangle,
  Home, Users, Calendar, ChevronDown, ChevronUp,
  Building2, User, Hammer, MapPin, Info, DollarSign, FileText, ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type AgentTask = {
  id: string;
  label: string;
  group: string;
  phase: string;
  completed: boolean;
  completedAt: string | null;
  dueDate: string | null;
  reminderSentAt: string | null;
};

function formatDate(d?: string | null) {
  if (!d) return null;
  try { return format(parseISO(d), 'MMM d, yyyy'); } catch { return d; }
}

const PHASE_LABELS: Record<string, string> = {
  after_listing:    'After Listing Taken',
  before_closing:   'Before Closing',
  after_closing:    'After Closing',
  after_contract:   'After Contract Executed',
};

const STATUS_COLORS: Record<string, string> = {
  active:          'bg-green-100 text-green-800',
  pending:         'bg-yellow-100 text-yellow-800',
  under_contract:  'bg-blue-100 text-blue-800',
  closed:          'bg-gray-100 text-gray-700',
  coming_soon:     'bg-purple-100 text-purple-800',
  expired:         'bg-red-100 text-red-800',
  canceled:        'bg-red-100 text-red-800',
};

function Dl({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium mt-0.5">{value}</dd>
    </div>
  );
}

function SectionCard({ title, icon, children, defaultCollapsed = false }: {
  title: string; icon?: React.ReactNode; children: React.ReactNode; defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setCollapsed(c => !c)}
      >
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">{icon}{title}</span>
          {collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
        </CardTitle>
      </CardHeader>
      {!collapsed && <CardContent>{children}</CardContent>}
    </Card>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">{children}</dl>;
}
function Grid3({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-sm">{children}</dl>;
}

export default function TransactionDetailPage({ params }: { params: Promise<{ txId: string }> }) {
  const { txId } = use(params);
  const { user, loading: userLoading } = useUser();
  const [transaction, setTransaction] = useState<any>(null);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsedPhases, setCollapsedPhases] = useState<Record<string, boolean>>({
    after_closing: true,
  });

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const txRes = await fetch(`/api/agent/transactions/${txId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const txData = await txRes.json();
      if (txData.ok) setTransaction(txData.transaction || txData);

      const taskRes = await fetch(`/api/agent/agent-tasks?transactionId=${txId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const taskData = await taskRes.json();
      if (taskData.ok) setTasks(taskData.tasks || []);
    } catch { /* non-fatal */ } finally {
      setLoading(false);
    }
  }, [user, txId]);

  useEffect(() => {
    if (!userLoading && user) loadData();
    else if (!userLoading && !user) setLoading(false);
  }, [user, userLoading, loadData]);

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

  const togglePhase = (phase: string) => {
    setCollapsedPhases(prev => ({ ...prev, [phase]: !prev[phase] }));
  };

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
  const side = tx.side || tx.dealType || tx.closingType || '';
  const closeDate = tx.projectedCloseDate || tx.closedDate || tx.closingDate;

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

  // Agent commission fields (visible to agent)
  const agentNet = tx.splitSnapshot?.agentNetCommission ?? tx.agentDollar ?? null;
  const agentPct = tx.splitSnapshot?.agentSplitPercent ?? tx.agentPct ?? null;
  const sellerCommPct = tx.sellerPayingListingAgent ?? tx.commissionPercent ?? null;
  const buyerCommPct = tx.sellerPayingBuyerAgent ?? null;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Link href="/dashboard/my-transactions" className="hover:underline flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> My Transactions
          </Link>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{address}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge className={cn('text-sm', STATUS_COLORS[status] || 'bg-muted text-foreground')}>
                {status.replace(/_/g, ' ')}
              </Badge>
              {side && (
                <Badge variant="outline" className="capitalize">
                  {side === 'buyer' ? <><Users className="h-3 w-3 mr-1" />Buyer</> : <><Home className="h-3 w-3 mr-1" />Listing</>}
                </Badge>
              )}
              {closeDate && (
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Close: {formatDate(closeDate)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Agent Task Workflow */}
      {tasks.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="pt-6 pb-6 text-center">
            <ClipboardList className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No task workflow has been set up for this transaction yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Tasks are created automatically when a transaction is added.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" /> My Task Workflow
                </CardTitle>
                <CardDescription>
                  {completedCount} of {totalCount} tasks completed · {pct}%
                </CardDescription>
              </div>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 mt-2">
              <div
                className="bg-green-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {phaseOrder.filter(ph => phases[ph]?.length > 0).map(ph => {
              const phaseTasks = phases[ph] || [];
              const phaseCompleted = phaseTasks.filter(t => t.completed).length;
              const isCollapsed = collapsedPhases[ph];
              const allDone = phaseCompleted === phaseTasks.length;
              return (
                <div key={ph}>
                  <button
                    type="button"
                    className="w-full flex items-center justify-between text-left"
                    onClick={() => togglePhase(ph)}
                  >
                    <div className="flex items-center gap-2">
                      {allDone
                        ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                        : <ClipboardList className="h-4 w-4 text-muted-foreground" />
                      }
                      <span className="text-sm font-semibold">
                        {PHASE_LABELS[ph] || ph.replace(/_/g, ' ')}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {phaseCompleted}/{phaseTasks.length}
                      </Badge>
                    </div>
                    {isCollapsed
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      : <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    }
                  </button>
                  {!isCollapsed && (
                    <div className="mt-3 space-y-2 pl-6">
                      {phaseTasks.map(task => (
                        <div
                          key={task.id}
                          className={cn(
                            'flex items-start gap-3 p-3 rounded-md border transition-colors',
                            task.completed
                              ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                              : 'bg-background'
                          )}
                        >
                          <Checkbox
                            checked={task.completed}
                            onCheckedChange={() => handleToggleTask(task)}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <p className={cn('text-sm', task.completed && 'line-through text-muted-foreground')}>
                              {task.label}
                            </p>
                            {task.completed && task.completedAt && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                ✓ Completed {formatDate(task.completedAt)}
                              </p>
                            )}
                            {!task.completed && task.dueDate && (
                              <p className="text-xs text-amber-600 mt-0.5">
                                Due: {formatDate(task.dueDate)}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <Separator className="mt-4" />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ── Transaction Details ──────────────────────────────────────────────── */}
      <SectionCard title="Transaction Details" icon={<Home className="h-4 w-4" />}>
        <Grid3>
          <Dl label="Property Address" value={tx.propertyAddress || tx.address} />
          <Dl label="MLS Number" value={tx.mlsNumber} />
          <Dl label="Deal Type" value={tx.dealType?.replace(/_/g, ' ')} />
          <Dl label="Transaction Type" value={tx.closingType?.replace(/_/g, ' ')} />
          <Dl label="Deal Source" value={tx.dealSource?.replace(/_/g, ' ')} />
          <Dl label="Listing Date" value={formatDate(tx.listingDate)} />
          <Dl label="Listing Expiration" value={formatDate(tx.listingExpirationDate)} />
          <Dl label="List Price" value={tx.listPrice ? `$${Number(tx.listPrice).toLocaleString()}` : null} />
          <Dl label="Sale Price" value={tx.salePrice ? `$${Number(tx.salePrice).toLocaleString()}` : null} />
        </Grid3>
        {tx.mlsDescription && (
          <div className="mt-4">
            <dt className="text-xs text-muted-foreground mb-1">MLS Description</dt>
            <dd className="text-sm whitespace-pre-wrap border rounded-md p-3 bg-muted/30">{tx.mlsDescription}</dd>
          </div>
        )}
      </SectionCard>

      {/* ── Commission (agent-visible only) ─────────────────────────────────── */}
      <SectionCard title="My Commission" icon={<DollarSign className="h-4 w-4" />}>
        <Grid3>
          <Dl label="Seller Commission %" value={sellerCommPct != null ? `${sellerCommPct}%` : null} />
          <Dl label="Buyer Agent Commission %" value={buyerCommPct != null ? `${buyerCommPct}%` : null} />
          <Dl label="My Split %" value={agentPct != null ? `${agentPct}%` : null} />
          <Dl label="Net to Me" value={agentNet != null ? `$${Number(agentNet).toLocaleString()}` : null} />
          <Dl label="Earnest Money" value={tx.earnestMoney ? `$${Number(tx.earnestMoney).toLocaleString()}` : null} />
        </Grid3>
      </SectionCard>

      {/* ── Key Dates ────────────────────────────────────────────────────────── */}
      <SectionCard title="Key Dates" icon={<Calendar className="h-4 w-4" />}>
        <Grid3>
          <Dl label="Contract Date" value={formatDate(tx.contractDate)} />
          <Dl label="Projected Close" value={formatDate(tx.projectedCloseDate)} />
          <Dl label="Closed Date" value={formatDate(tx.closedDate || tx.closingDate)} />
          <Dl label="Option Expiration" value={formatDate(tx.optionExpiration)} />
          <Dl label="Inspection Deadline" value={formatDate(tx.inspectionDeadline)} />
          <Dl label="Survey Deadline" value={formatDate(tx.surveyDeadline)} />
          <Dl label="Loan App Deadline" value={formatDate(tx.loanApplicationDeadline)} />
          <Dl label="Appraisal Deadline" value={formatDate(tx.appraisalDeadline)} />
          <Dl label="Title Deadline" value={formatDate(tx.titleDeadline)} />
          <Dl label="Final Loan Commitment" value={formatDate(tx.finalLoanCommitmentDeadline)} />
        </Grid3>
      </SectionCard>

      {/* ── Client / Buyer / Seller ──────────────────────────────────────────── */}
      <SectionCard title="Client Information" icon={<User className="h-4 w-4" />}>
        <Grid3>
          <Dl label="Client Name" value={tx.clientName} />
          <Dl label="Client Email" value={tx.clientEmail} />
          <Dl label="Client Phone" value={tx.clientPhone} />
          <Dl label="Client 2 Name" value={tx.client2Name} />
          <Dl label="Client 2 Email" value={tx.client2Email} />
          <Dl label="Client 2 Phone" value={tx.client2Phone} />
          <Dl label="Buyer Name" value={tx.buyerName} />
          <Dl label="Buyer Email" value={tx.buyerEmail} />
          <Dl label="Buyer Phone" value={tx.buyerPhone} />
          <Dl label="Buyer 2 Name" value={tx.buyer2Name} />
          <Dl label="Seller Name" value={tx.sellerName} />
          <Dl label="Seller Email" value={tx.sellerEmail} />
          <Dl label="Seller Phone" value={tx.sellerPhone} />
          <Dl label="Seller 2 Name" value={tx.seller2Name} />
        </Grid3>
      </SectionCard>

      {/* ── Other Agent ─────────────────────────────────────────────────────── */}
      {(tx.otherAgentName || tx.otherBrokerage) && (
        <SectionCard title="Other Agent / Co-op" icon={<Users className="h-4 w-4" />}>
          <Grid3>
            <Dl label="Other Agent" value={tx.otherAgentName} />
            <Dl label="Brokerage" value={tx.otherBrokerage || tx.otherAgentBrokerage} />
            <Dl label="Email" value={tx.otherAgentEmail} />
            <Dl label="Phone" value={tx.otherAgentPhone} />
          </Grid3>
        </SectionCard>
      )}

      {/* ── Lender ──────────────────────────────────────────────────────────── */}
      {(tx.mortgageCompany || tx.loanOfficer) && (
        <SectionCard title="Lender Information" icon={<Building2 className="h-4 w-4" />}>
          <Grid3>
            <Dl label="Mortgage Company" value={tx.mortgageCompany} />
            <Dl label="Lender Office" value={tx.lenderOffice} />
            <Dl label="Loan Officer" value={tx.loanOfficer} />
            <Dl label="Loan Officer Email" value={tx.loanOfficerEmail} />
            <Dl label="Loan Officer Phone" value={tx.loanOfficerPhone} />
          </Grid3>
        </SectionCard>
      )}

      {/* ── Title ───────────────────────────────────────────────────────────── */}
      {(tx.titleCompany || tx.titleOfficer || tx.titleAttorney) && (
        <SectionCard title="Title Information" icon={<Building2 className="h-4 w-4" />}>
          <Grid3>
            <Dl label="Title Company" value={tx.titleCompany} />
            <Dl label="Title Office" value={tx.titleOffice} />
            <Dl label="Title Officer" value={tx.titleOfficer} />
            <Dl label="Title Officer Email" value={tx.titleOfficerEmail} />
            <Dl label="Title Officer Phone" value={tx.titleOfficerPhone} />
            <Dl label="Title Attorney" value={tx.titleAttorney} />
          </Grid3>
        </SectionCard>
      )}

      {/* ── Pre-Listing Inspection ───────────────────────────────────────────── */}
      {tx.preListingInspectionOrdered && (
        <SectionCard title="Pre-Listing Inspection" icon={<Hammer className="h-4 w-4" />}>
          <Grid3>
            <Dl label="Ordered" value={tx.preListingInspectionOrdered ? 'Yes' : 'No'} />
            <Dl label="Target Date" value={formatDate(tx.preListingTargetInspectionDate)} />
            <Dl label="Inspector" value={tx.preListingInspectorName} />
            <Dl label="TC Scheduling" value={tx.preListingTcScheduleInspections ? 'Yes' : null} />
            <Dl label="Notes" value={tx.preListingTcScheduleInspectionsOther} />
          </Grid3>
        </SectionCard>
      )}

      {/* ── Buyer Inspection ─────────────────────────────────────────────────── */}
      {tx.inspectionOrdered && (
        <SectionCard title="Buyer Inspection" icon={<Hammer className="h-4 w-4" />}>
          <Grid3>
            <Dl label="Ordered" value={tx.inspectionOrdered === 'yes' || tx.inspectionOrdered === true ? 'Yes' : 'No'} />
            <Dl label="Target Date" value={formatDate(tx.targetInspectionDate)} />
            <Dl label="Inspector" value={tx.inspectorName} />
            <Dl label="TC Scheduling" value={tx.tcScheduleInspections === 'yes' || tx.tcScheduleInspections === true ? 'Yes — TC will schedule' : tx.tcScheduleInspections === 'no' || tx.tcScheduleInspections === false ? 'No — Agent will schedule' : null} />
            <Dl label="Notes" value={tx.tcScheduleInspectionsOther} />
          </Grid3>
          {Array.isArray(tx.inspectionTypes) && tx.inspectionTypes.length > 0 && (
            <div className="mt-3">
              <dt className="text-xs text-muted-foreground mb-2">Inspection Types</dt>
              <div className="flex flex-wrap gap-2">
                {tx.inspectionTypes.map((t: string) => (
                  <span key={t} className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{t}</span>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── Media Order ──────────────────────────────────────────────────────── */}
      {(tx.closingType === 'listing' || tx.closingType === 'dual') && (
        <SectionCard title="Media Order" icon={<MapPin className="h-4 w-4" />} defaultCollapsed={true}>
          {Array.isArray(tx.mediaTypes) && tx.mediaTypes.length > 0 && (
            <div className="mb-4">
              <dt className="text-xs text-muted-foreground mb-2">Media Types Requested</dt>
              <div className="flex flex-wrap gap-2">
                {tx.mediaTypes.map((t: string) => (
                  <span key={t} className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{t}</span>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-5 flex flex-col items-center gap-4 text-center">
            <div>
              <p className="font-semibold text-blue-900 dark:text-blue-200 text-base mb-1">Order Media Through Media Engage</p>
              <p className="text-sm text-blue-700 dark:text-blue-300">All media orders are placed directly through Media Engage. Click below to open their order form. Staff will follow up to confirm scheduling.</p>
            </div>
            <a
              href="https://mediaengagellc.com/order/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md bg-blue-700 hover:bg-blue-800 text-white font-semibold px-6 py-3 text-sm transition-colors"
            >
              📷 Order Media at Media Engage
            </a>
          </div>
        </SectionCard>
      )}

      {/* ── Sign Order ───────────────────────────────────────────────────────── */}
      {tx.signOrderRequested && (
        <SectionCard title="Sign Order" icon={<Hammer className="h-4 w-4" />} defaultCollapsed={true}>
          <Grid3>
            <Dl label="Service Type" value={tx.signServiceType} />
            <Dl label="Rider / Extension" value={tx.signRiderExt} />
            <Dl label="Requested Install Date" value={formatDate(tx.signRequestedDate)} />
            <Dl label="Owner Name" value={tx.signOwnerName} />
            <Dl label="Special Requests" value={tx.signSpecialRequests} />
          </Grid3>
        </SectionCard>
      )}

      {/* ── ShowingTime ──────────────────────────────────────────────────────── */}
      {tx.showingTimeRequested && (
        <SectionCard title="ShowingTime Setup" icon={<Calendar className="h-4 w-4" />} defaultCollapsed={true}>
          <Grid3>
            <Dl label="New or Change" value={tx.showingNewOrChange} />
            <Dl label="Appointment Handling" value={tx.showingApptHandling} />
            <Dl label="Appointment Type" value={tx.showingApptType} />
            <Dl label="Lead Time Required" value={tx.showingLeadTimeRequired} />
            <Dl label="Lead Time Suggested" value={tx.showingLeadTimeSuggested} />
            <Dl label="Max Appt Length" value={tx.showingMaxApptLength} />
            <Dl label="Virtual Showing" value={tx.showingVirtualPreference} />
            <Dl label="Lockbox Type" value={tx.showingLockboxType} />
            <Dl label="Lockbox Location" value={tx.showingLockboxLocation} />
            <Dl label="Access Type" value={tx.showingAccessType} />
            <Dl label="Access Door" value={tx.showingAccessDoor} />
            <Dl label="Passcode / Gate Code" value={tx.showingPasscode} />
            <Dl label="Alarm Code" value={tx.showingAlarmCode} />
            <Dl label="Alarm Disarm Code" value={tx.showingDisarmCode} />
            <Dl label="Alarm Arm Code" value={tx.showingArmCode} />
            {tx.showingNoSameDayAppts && <Dl label="Same-Day Appts" value="No same-day appointments" />}
            {tx.showingApptOverlaps && <Dl label="Overlaps" value="Allow appointment overlaps" />}
            {tx.showingShareAgentInfo && <Dl label="Share Agent Info" value="Yes — share with showing agents" />}
          </Grid3>
          {tx.showingAlarmNotes && (
            <div className="mt-3">
              <dt className="text-xs text-muted-foreground">Alarm Notes</dt>
              <dd className="text-sm mt-0.5">{tx.showingAlarmNotes}</dd>
            </div>
          )}
          {tx.showingAccessNotes && (
            <div className="mt-3">
              <dt className="text-xs text-muted-foreground">Access Notes</dt>
              <dd className="text-sm mt-0.5">{tx.showingAccessNotes}</dd>
            </div>
          )}
          {tx.showingNotesToAgent && (
            <div className="mt-3">
              <dt className="text-xs text-muted-foreground">Notes to Showing Agent</dt>
              <dd className="text-sm mt-0.5">{tx.showingNotesToAgent}</dd>
            </div>
          )}
          {tx.showingNotesToStaff && (
            <div className="mt-3">
              <dt className="text-xs text-muted-foreground">Notes to Staff</dt>
              <dd className="text-sm mt-0.5">{tx.showingNotesToStaff}</dd>
            </div>
          )}
          {tx.showingCallOrder2Name && (
            <div className="mt-3 border rounded-md p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Call Order Contact #2</p>
              <Grid3>
                <Dl label="Name" value={tx.showingCallOrder2Name} />
                <Dl label="Mobile" value={tx.showingCallOrder2Mobile} />
                <Dl label="Email" value={tx.showingCallOrder2Email} />
              </Grid3>
            </div>
          )}
          {tx.showingCallOrder3Name && (
            <div className="mt-3 border rounded-md p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Call Order Contact #3</p>
              <Grid3>
                <Dl label="Name" value={tx.showingCallOrder3Name} />
                <Dl label="Mobile" value={tx.showingCallOrder3Mobile} />
                <Dl label="Email" value={tx.showingCallOrder3Email} />
              </Grid3>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── Additional Info ──────────────────────────────────────────────────── */}
      {(tx.warrantyAtClosing || tx.occupancyAgreement || tx.shortageInCommission || tx.txComplianceFee) && (
        <SectionCard title="Additional Transaction Info" icon={<Info className="h-4 w-4" />} defaultCollapsed={true}>
          <Grid3>
            <Dl label="Warranty at Closing" value={tx.warrantyAtClosing} />
            <Dl label="Warranty Amount" value={tx.warrantyAmount ? `$${Number(tx.warrantyAmount).toLocaleString()}` : null} />
            <Dl label="Warranty Paid By" value={tx.warrantyPaidBy} />
            <Dl label="Occupancy Agreement" value={tx.occupancyAgreement} />
            <Dl label="Occupancy Dates" value={tx.occupancyDates} />
            <Dl label="Shortage in Commission" value={tx.shortageInCommission} />
            <Dl label="Shortage Amount" value={tx.shortageAmount ? `$${Number(tx.shortageAmount).toLocaleString()}` : null} />
            <Dl label="Compliance Fee" value={tx.txComplianceFee} />
            <Dl label="Compliance Fee Amount" value={tx.txComplianceFeeAmount ? `$${Number(tx.txComplianceFeeAmount).toLocaleString()}` : null} />
            <Dl label="Compliance Fee Paid By" value={tx.txComplianceFeePaidBy} />
          </Grid3>
        </SectionCard>
      )}

      {/* ── Referrals ────────────────────────────────────────────────────────── */}
      {(tx.hasOutboundReferral || tx.hasInboundReferral) && (
        <SectionCard title="Referral Information" icon={<Users className="h-4 w-4" />} defaultCollapsed={true}>
          {tx.hasOutboundReferral && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Outbound Referral</p>
              <Grid3>
                <Dl label="Referral Agent" value={tx.outboundReferralAgentName} />
                <Dl label="Brokerage" value={tx.outboundReferralBrokerage} />
                <Dl label="Fee %" value={tx.outboundReferralFeePercent != null ? `${tx.outboundReferralFeePercent}%` : null} />
              </Grid3>
            </div>
          )}
          {tx.hasInboundReferral && (
            <div className={tx.hasOutboundReferral ? 'mt-4' : ''}>
              <p className="text-xs font-medium text-muted-foreground mb-2">Inbound Referral</p>
              <Grid3>
                <Dl label="Referring Agent" value={tx.inboundReferralAgentName} />
                <Dl label="Fee %" value={tx.inboundReferralFeePercent != null ? `${tx.inboundReferralFeePercent}%` : null} />
              </Grid3>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── Notes ────────────────────────────────────────────────────────────── */}
      {(tx.notes || tx.additionalComments) && (
        <SectionCard title="Notes" icon={<Info className="h-4 w-4" />}>
          {tx.notes && (
            <div>
              <dt className="text-xs text-muted-foreground mb-1">Transaction Notes</dt>
              <dd className="text-sm whitespace-pre-wrap">{tx.notes}</dd>
            </div>
          )}
          {tx.additionalComments && (
            <div className={tx.notes ? 'mt-3' : ''}>
              <dt className="text-xs text-muted-foreground mb-1">Additional Comments</dt>
              <dd className="text-sm whitespace-pre-wrap">{tx.additionalComments}</dd>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── Documents ────────────────────────────────────────────────────────── */}
      {Array.isArray(tx.documents) && tx.documents.length > 0 && (
        <SectionCard title="Documents" icon={<FileText className="h-4 w-4" />}>
          <div className="space-y-2">
            {tx.documents.map((doc: any, idx: number) => (
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
                  {doc.uploadedAt && (
                    <p className="text-xs text-muted-foreground">
                      {formatDate(doc.uploadedAt)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
