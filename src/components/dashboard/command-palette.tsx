'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Home, BarChart2, Target, TrendingUp, Plus, Users,
  FileText, Settings, Award, X, ArrowRight, Keyboard,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  category: 'navigate' | 'action' | 'admin';
  keywords?: string[];
}

const COMMANDS: CommandItem[] = [
  // Navigation
  { id: 'home', label: 'Dashboard', description: 'Your main performance overview', icon: Home, href: '/dashboard', category: 'navigate', keywords: ['home', 'overview', 'main'] },
  { id: 'tracker', label: 'Daily Tracker', description: 'Log calls, appointments, and leads', icon: BarChart2, href: '/dashboard/tracker', category: 'navigate', keywords: ['activity', 'calls', 'log', 'track'] },
  { id: 'plan', label: 'Business Plan', description: 'Set your annual goals and targets', icon: Target, href: '/dashboard/plan', category: 'navigate', keywords: ['goals', 'targets', 'annual', 'plan'] },
  { id: 'projections', label: 'Projections', description: 'See your year-end income forecast', icon: TrendingUp, href: '/dashboard/projections', category: 'navigate', keywords: ['forecast', 'income', 'year', 'projection'] },
  { id: 'leaderboard', label: 'Leaderboard', description: 'See how you rank against the team', icon: Award, href: '/leaderboard', category: 'navigate', keywords: ['rank', 'compete', 'team', 'board'] },
  // Actions
  { id: 'add-deal', label: 'Add New Deal', description: 'Log a new transaction', icon: Plus, href: '/dashboard/transactions/new', category: 'action', keywords: ['transaction', 'deal', 'new', 'add', 'submit'] },
  { id: 'tc-submit', label: 'TC Submit Form', description: 'Submit a transaction to your TC', icon: FileText, href: '/dashboard/tc/submit', category: 'action', keywords: ['tc', 'transaction coordinator', 'submit'] },
  // Admin
  { id: 'admin-agents', label: 'Manage Agents', description: 'View and edit agent profiles', icon: Users, href: '/dashboard/admin/agents', category: 'admin', keywords: ['agents', 'profiles', 'manage'] },
  { id: 'admin-transactions', label: 'All Transactions', description: 'View all team transactions', icon: FileText, href: '/dashboard/admin/transactions', category: 'admin', keywords: ['transactions', 'deals', 'all'] },
  { id: 'admin-settings', label: 'Admin Settings', description: 'Branding, teams, and configurations', icon: Settings, href: '/dashboard/admin/branding', category: 'admin', keywords: ['settings', 'config', 'admin', 'branding'] },
];

const CATEGORY_LABELS: Record<CommandItem['category'], string> = {
  navigate: 'Navigate',
  action: 'Quick Actions',
  admin: 'Admin',
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Open on ⌘K or Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  const filtered = query.trim()
    ? COMMANDS.filter(cmd => {
        const q = query.toLowerCase();
        return (
          cmd.label.toLowerCase().includes(q) ||
          (cmd.description || '').toLowerCase().includes(q) ||
          (cmd.keywords || []).some(k => k.includes(q))
        );
      })
    : COMMANDS;

  // Group by category
  const grouped = filtered.reduce<Record<string, CommandItem[]>>((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {});

  const flatFiltered = filtered;

  const execute = useCallback((item: CommandItem) => {
    setOpen(false);
    router.push(item.href);
  }, [router]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, flatFiltered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (flatFiltered[selectedIndex]) execute(flatFiltered[selectedIndex]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, flatFiltered, selectedIndex, execute]);

  if (!open) return null;

  let globalIndex = 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={() => setOpen(false)}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Palette */}
      <div
        className="relative w-full max-w-lg mx-4 rounded-2xl border bg-background shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            placeholder="Search pages, actions, agents..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center gap-1">
            <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
              ESC
            </kbd>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No results for &quot;{query}&quot;
            </div>
          ) : (
            Object.entries(grouped).map(([category, items]) => (
              <div key={category}>
                <div className="px-4 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {CATEGORY_LABELS[category as CommandItem['category']]}
                  </span>
                </div>
                {items.map(item => {
                  const isSelected = globalIndex === selectedIndex;
                  const currentIndex = globalIndex++;
                  return (
                    <button
                      key={item.id}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                        isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'
                      )}
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                      onClick={() => execute(item)}
                    >
                      <div className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0',
                        isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      )}>
                        <item.icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.label}</p>
                        {item.description && (
                          <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                        )}
                      </div>
                      {isSelected && <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t px-4 py-2 flex items-center gap-3 text-[10px] text-muted-foreground bg-muted/20">
          <span className="flex items-center gap-1"><kbd className="rounded border bg-muted px-1 py-0.5 font-mono">↑↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="rounded border bg-muted px-1 py-0.5 font-mono">↵</kbd> open</span>
          <span className="flex items-center gap-1"><kbd className="rounded border bg-muted px-1 py-0.5 font-mono">ESC</kbd> close</span>
          <span className="ml-auto flex items-center gap-1"><Keyboard className="h-3 w-3" /> ⌘K to open</span>
        </div>
      </div>
    </div>
  );
}
