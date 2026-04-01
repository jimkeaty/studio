'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, Circle, X, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  href?: string;
  action?: string;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    id: 'set_goal',
    label: 'Set your annual income goal',
    description: 'Tell us your target so we can calculate your daily activity numbers.',
    href: '/dashboard/plan',
    action: 'Go to Business Plan',
  },
  {
    id: 'add_first_deal',
    label: 'Add your first deal',
    description: 'Log a transaction to start tracking your commissions and progress.',
    href: '/dashboard/transactions/new',
    action: 'Add a Deal',
  },
  {
    id: 'log_activity',
    label: 'Log today\'s activity',
    description: 'Track your calls, appointments, and leads to earn your daily grade.',
    href: '/dashboard/tracker',
    action: 'Open Tracker',
  },
  {
    id: 'explore_dashboard',
    label: 'Explore your dashboard',
    description: 'See your Report Card, Tier Progress, and Pipeline all in one place.',
    href: '/dashboard',
    action: 'View Dashboard',
  },
];

const STORAGE_KEY = 'sb_onboarding_dismissed';
const COMPLETED_KEY = 'sb_onboarding_completed';

interface OnboardingChecklistProps {
  /** Pass true once the agent has at least one transaction */
  hasTransactions?: boolean;
  /** Pass true once the agent has set a business plan goal */
  hasGoal?: boolean;
}

export function OnboardingChecklist({ hasTransactions = false, hasGoal = false }: OnboardingChecklistProps) {
  const [dismissed, setDismissed] = useState(true); // start hidden, reveal after mount
  const [collapsed, setCollapsed] = useState(false);
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Check if permanently dismissed
    if (localStorage.getItem(STORAGE_KEY)) return;

    // Load completed items
    try {
      const saved = JSON.parse(localStorage.getItem(COMPLETED_KEY) || '[]') as string[];
      const completedSet = new Set<string>(saved);

      // Auto-complete based on props
      if (hasGoal) completedSet.add('set_goal');
      if (hasTransactions) completedSet.add('add_first_deal');

      setCompleted(completedSet);
    } catch {
      // ignore
    }

    setDismissed(false);
  }, [hasTransactions, hasGoal]);

  const markComplete = (id: string) => {
    setCompleted(prev => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem(COMPLETED_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setDismissed(true);
  };

  if (dismissed) return null;

  const completedCount = completed.size;
  const totalCount = CHECKLIST_ITEMS.length;
  const allDone = completedCount === totalCount;
  const progressPct = Math.round((completedCount / totalCount) * 100);

  return (
    <div className={cn(
      'rounded-xl border-2 overflow-hidden transition-all duration-300',
      allDone
        ? 'border-green-400 bg-gradient-to-r from-green-50 to-emerald-50'
        : 'border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className={cn('h-4 w-4', allDone ? 'text-green-500' : 'text-blue-500')} />
          <span className={cn('font-semibold text-sm', allDone ? 'text-green-700' : 'text-blue-700')}>
            {allDone ? 'You\'re all set! 🎉' : `Getting Started — ${completedCount}/${totalCount} complete`}
          </span>
          {!allDone && (
            <span className="text-xs text-blue-500 font-medium">{progressPct}%</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCollapsed(c => !c)}
            className="p-1 rounded hover:bg-blue-100 transition-colors text-blue-500"
            aria-label={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <button
            onClick={dismiss}
            className="p-1 rounded hover:bg-blue-100 transition-colors text-blue-400 hover:text-blue-600"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {!allDone && (
        <div className="px-4 pb-2">
          <div className="h-1.5 rounded-full bg-blue-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Checklist items */}
      {!collapsed && (
        <div className="px-4 pb-4 space-y-2">
          {CHECKLIST_ITEMS.map(item => {
            const done = completed.has(item.id);
            return (
              <div
                key={item.id}
                className={cn(
                  'flex items-start gap-3 rounded-lg p-3 transition-colors',
                  done ? 'bg-white/60' : 'bg-white/80 hover:bg-white'
                )}
              >
                <button
                  onClick={() => !done && markComplete(item.id)}
                  className="flex-shrink-0 mt-0.5"
                  aria-label={done ? 'Completed' : 'Mark complete'}
                >
                  {done ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <Circle className="h-5 w-5 text-blue-300 hover:text-blue-500 transition-colors" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-medium', done && 'line-through text-muted-foreground')}>
                    {item.label}
                  </p>
                  {!done && (
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  )}
                </div>
                {item.href && !done && (
                  <Link
                    href={item.href}
                    onClick={() => markComplete(item.id)}
                    className="flex-shrink-0 text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline whitespace-nowrap"
                  >
                    {item.action} →
                  </Link>
                )}
              </div>
            );
          })}

          {allDone && (
            <p className="text-sm text-green-600 text-center py-1">
              You&apos;ve completed all the getting-started steps. You&apos;re ready to close deals!
            </p>
          )}
        </div>
      )}
    </div>
  );
}
