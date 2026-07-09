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
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft, CheckCircle2, ClipboardList, AlertTriangle,
  Home, Users, Calendar, ChevronDown, ChevronUp,
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
      // Load transaction
      const txRes = await fetch(`/api/agent/transactions/${txId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const txData = await txRes.json();
      if (txData.ok) setTransaction(txData.transaction || txData);

      // Load agent tasks
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
    // Optimistic update
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
      // Revert on error
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

  const address = transaction?.propertyAddress || transaction?.address || 'Transaction';
  const status = transaction?.status || 'active';
  const side = transaction?.side || transaction?.dealType || transaction?.closingType || '';
  const closeDate = transaction?.projectedCloseDate || transaction?.closedDate || transaction?.closingDate;

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
            {/* Progress bar */}
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

      {/* Transaction Details */}
      {transaction && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transaction Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              {transaction.clientName && (
                <div><dt className="text-xs text-muted-foreground">Client</dt><dd className="font-medium">{transaction.clientName}</dd></div>
              )}
              {transaction.sellerName && (
                <div><dt className="text-xs text-muted-foreground">Seller</dt><dd className="font-medium">{transaction.sellerName}</dd></div>
              )}
              {transaction.buyerName && (
                <div><dt className="text-xs text-muted-foreground">Buyer</dt><dd className="font-medium">{transaction.buyerName}</dd></div>
              )}
              {transaction.listPrice && (
                <div><dt className="text-xs text-muted-foreground">List Price</dt><dd className="font-medium">${Number(transaction.listPrice).toLocaleString()}</dd></div>
              )}
              {transaction.salePrice && (
                <div><dt className="text-xs text-muted-foreground">Sale Price</dt><dd className="font-medium">${Number(transaction.salePrice).toLocaleString()}</dd></div>
              )}
              {transaction.contractDate && (
                <div><dt className="text-xs text-muted-foreground">Contract Date</dt><dd className="font-medium">{formatDate(transaction.contractDate)}</dd></div>
              )}
              {closeDate && (
                <div><dt className="text-xs text-muted-foreground">Projected Close</dt><dd className="font-medium">{formatDate(closeDate)}</dd></div>
              )}
              {transaction.titleCompany && (
                <div><dt className="text-xs text-muted-foreground">Title Company</dt><dd className="font-medium">{transaction.titleCompany}</dd></div>
              )}
              {transaction.mortgageCompany && (
                <div><dt className="text-xs text-muted-foreground">Lender</dt><dd className="font-medium">{transaction.mortgageCompany}</dd></div>
              )}
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
