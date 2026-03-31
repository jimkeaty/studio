'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trophy, Flag, Plus, Settings, Play, Calendar, Users, Zap, BarChart3, AlertCircle } from 'lucide-react';
import { useUser } from '@/firebase';
import { getDefaultConfig } from '@/lib/competitions/scoring-engine';
import type { Competition, CompetitionConfig, CompetitionTheme } from '@/lib/competitions/types';
import Link from 'next/link';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

// ── Metric options ──────────────────────────────────────────────────────────
const METRIC_OPTIONS = [
  { value: 'appointments_set', label: 'Appointments Set' },
  { value: 'appointments_held', label: 'Appointments Held' },
  { value: 'engagements', label: 'Engagements' },
  { value: 'calls', label: 'Calls' },
  { value: 'contracts_written', label: 'Contracts Written' },
  { value: 'closed_deals', label: 'Closed Deals' },
  { value: 'pending_deals', label: 'Pending Deals' },
  { value: 'closed_volume', label: 'Closed Volume' },
  { value: 'total_units', label: 'Total Units' },
] as const;

// ── Status badge styling ────────────────────────────────────────────────────
function statusBadge(status: string) {
  switch (status) {
    case 'active':
      return <Badge className="bg-green-100 text-green-800 border-green-300">Active</Badge>;
    case 'completed':
      return <Badge className="bg-blue-100 text-blue-800 border-blue-300">Completed</Badge>;
    case 'archived':
      return <Badge className="bg-gray-100 text-gray-600 border-gray-300">Archived</Badge>;
    default:
      return <Badge variant="outline">Draft</Badge>;
  }
}

function themeBadge(theme: CompetitionTheme) {
  if (theme === 'nascar') {
    return <Badge className="bg-gray-900 text-white border-gray-700">🏁 NASCAR</Badge>;
  }
  return <Badge className="bg-green-700 text-white border-green-600">⛳ Golf</Badge>;
}

// ── Format date range ───────────────────────────────────────────────────────
function fmtDateRange(start: string, end: string) {
  const fmt = (d: string) => {
    const date = new Date(d + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  return `${fmt(start)} — ${fmt(end)}`;
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

export default function CompetitionCenterPage() {
  const { user, loading: userLoading } = useUser();
  const isAdmin = user?.uid === ADMIN_UID;
  const [isStaffAdmin, setIsStaffAdmin] = useState(false);
  useEffect(() => {
    if (!user || user.uid === ADMIN_UID) return;
    let cancelled = false;
    user.getIdToken().then((token) => {
      fetch('/api/admin/staff-users', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => { if (!cancelled && d.ok) setIsStaffAdmin(true); })
        .catch(() => {});
    });
    return () => { cancelled = true; };
  }, [user]);
  const hasAdminAccess: boolean = !!(user && ((user as any).role === 'admin' || isStaffAdmin));

  // ── Data state ──────────────────────────────────────────────────────────
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Create dialog state ─────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<CompetitionTheme | null>(null);
  const [formData, setFormData] = useState<Partial<CompetitionConfig>>({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // ── Status toggle state ─────────────────────────────────────────────────
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // ── Fetch competitions ──────────────────────────────────────────────────
  const fetchCompetitions = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/competitions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Failed to load competitions');
      }
      const data = await res.json();
      setCompetitions(data.competitions || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCompetitions();
  }, [fetchCompetitions]);

  // ── Theme selection handler ─────────────────────────────────────────────
  const handleThemeSelect = (theme: CompetitionTheme) => {
    setSelectedTheme(theme);
    const defaults = getDefaultConfig(theme);
    setFormData({
      ...defaults,
      name: '',
      description: '',
      startDate: new Date().toISOString().slice(0, 10),
      endDate: `${new Date().getFullYear()}-12-31`,
    });
    setCreateError(null);
  };

  // ── Create competition handler ──────────────────────────────────────────
  const handleCreate = async () => {
    if (!user || !formData.name || !selectedTheme) return;
    setCreating(true);
    setCreateError(null);
    try {
      const token = await user.getIdToken();
      const payload: CompetitionConfig = {
        ...(getDefaultConfig(selectedTheme)),
        ...formData,
        name: formData.name!,
        theme: selectedTheme,
        createdBy: user.uid,
      } as CompetitionConfig;

      const res = await fetch('/api/competitions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Failed to create competition');
      }
      // Success — close dialog and refresh list
      setShowCreate(false);
      setSelectedTheme(null);
      setFormData({});
      await fetchCompetitions();
    } catch (e: any) {
      setCreateError(e.message);
    } finally {
      setCreating(false);
    }
  };

  // ── Status toggle handler ───────────────────────────────────────────────
  const handleStatusToggle = async (competition: Competition) => {
    if (!user) return;
    const nextStatus: Record<string, string> = {
      draft: 'active',
      active: 'completed',
      completed: 'archived',
    };
    const newStatus = nextStatus[competition.config.status];
    if (!newStatus) return;

    setTogglingId(competition.id);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/competitions/${competition.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Failed to update status');
      }
      await fetchCompetitions();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setTogglingId(null);
    }
  };

  // ── Computed summaries ──────────────────────────────────────────────────
  const activeCount = competitions.filter(c => c.config.status === 'active').length;
  const themesAvailable = 2; // NASCAR, Golf

  // ── Loading / error states ──────────────────────────────────────────────
  if (userLoading || loading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-12 w-1/2" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Sign In Required</AlertTitle>
        <AlertDescription>Please sign in to access the Competition Center.</AlertDescription>
      </Alert>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-2xl shadow-lg">
            <Trophy className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Competition Center</h1>
            <p className="text-muted-foreground">{hasAdminAccess ? 'Create and manage competitions across themes' : 'View active competitions and your standings'}</p>
          </div>
        </div>
        {hasAdminAccess && (
          <Button
            onClick={() => { setShowCreate(true); setSelectedTheme(null); setFormData({}); setCreateError(null); }}
            size="lg"
            className="gap-2"
          >
            <Plus className="h-5 w-5" />
            New Competition
          </Button>
        )}
      </div>

      {/* ── Summary Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Competitions</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{activeCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Currently running</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Competitions</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{competitions.length}</div>
            <p className="text-xs text-muted-foreground mt-1">All time (draft, active, completed)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Themes Available</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{themesAvailable}</div>
            <p className="text-xs text-muted-foreground mt-1">NASCAR, Golf</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Competitions List ─────────────────────────────────────────────── */}
      {competitions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Trophy className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-1">No Competitions Yet</h3>
            <p className="text-muted-foreground text-sm mb-4">{hasAdminAccess ? 'Create your first competition to get started.' : 'No competitions have been set up yet.'}</p>
            {hasAdminAccess && (
              <Button onClick={() => { setShowCreate(true); setSelectedTheme(null); setFormData({}); }}>
                <Plus className="h-4 w-4 mr-2" />
                Create Competition
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Flag className="h-5 w-5" />
            All Competitions
          </h2>
          <div className="grid gap-3">
            {competitions
              .sort((a, b) => {
                // Active first, then by updatedAt descending
                const statusOrder: Record<string, number> = { active: 0, draft: 1, completed: 2, archived: 3 };
                const sa = statusOrder[a.config.status] ?? 4;
                const sb = statusOrder[b.config.status] ?? 4;
                if (sa !== sb) return sa - sb;
                return (b.config.updatedAt || '').localeCompare(a.config.updatedAt || '');
              })
              .map((comp) => (
                <Link key={comp.id} href={`/dashboard/admin/competitions/${comp.id}`}>
                  <Card
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      comp.config.status === 'active'
                        ? 'ring-2 ring-green-500 border-green-300'
                        : 'hover:border-foreground/20'
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        {/* Left: Name + badges */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h3 className="text-base font-semibold truncate">{comp.config.name}</h3>
                            {themeBadge(comp.config.theme)}
                            {statusBadge(comp.config.status)}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {fmtDateRange(comp.config.startDate, comp.config.endDate)}
                            </span>
                            <span className="flex items-center gap-1">
                              <BarChart3 className="h-3 w-3" />
                              {comp.config.metricLabel || comp.config.metric}
                            </span>
                            {comp.config.description && (
                              <span className="hidden lg:inline truncate max-w-[300px]">
                                {comp.config.description}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Right: Status toggle (admin only) */}
                        {hasAdminAccess && (
                          <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.preventDefault()}>
                            {comp.config.status !== 'archived' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                disabled={togglingId === comp.id}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleStatusToggle(comp);
                                }}
                              >
                                {togglingId === comp.id ? (
                                  'Updating...'
                                ) : comp.config.status === 'draft' ? (
                                  <>
                                    <Play className="h-3 w-3 mr-1" />
                                    Activate
                                  </>
                                ) : comp.config.status === 'active' ? (
                                  <>
                                    <Flag className="h-3 w-3 mr-1" />
                                    Complete
                                  </>
                                ) : (
                                  'Archive'
                                )}
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
          </div>
        </div>
      )}

      {/* ── Create Competition Dialog (admin only) ───────────────────────── */}
      <Dialog open={hasAdminAccess && showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              New Competition
            </DialogTitle>
            <DialogDescription>
              Choose a theme, then configure your competition.
            </DialogDescription>
          </DialogHeader>

          {/* Theme selector */}
          {!selectedTheme ? (
            <div className="grid grid-cols-2 gap-4 py-4">
              <button
                onClick={() => handleThemeSelect('nascar')}
                className="group relative rounded-xl border-2 border-transparent hover:border-gray-400 bg-gray-900 text-white p-6 text-center transition-all hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-600"
              >
                <div className="text-4xl mb-3">🏁</div>
                <h3 className="text-lg font-bold">NASCAR</h3>
                <p className="text-xs text-gray-400 mt-1">Points race with cars, engine sounds, and pit stops</p>
              </button>

              <button
                onClick={() => handleThemeSelect('golf')}
                className="group relative rounded-xl border-2 border-transparent hover:border-green-400 bg-gradient-to-br from-green-700 to-green-800 text-white p-6 text-center transition-all hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-600"
              >
                <div className="text-4xl mb-3">⛳</div>
                <h3 className="text-lg font-bold">Golf</h3>
                <p className="text-xs text-green-200 mt-1">Clubhouse leaderboard with par, birdies, and eagles</p>
              </button>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {/* Theme indicator */}
              <div className="flex items-center justify-between">
                {themeBadge(selectedTheme)}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => { setSelectedTheme(null); setFormData({}); }}
                >
                  Change Theme
                </Button>
              </div>

              {/* Competition Name */}
              <div className="space-y-1.5">
                <Label htmlFor="comp-name">Competition Name *</Label>
                <Input
                  id="comp-name"
                  value={formData.name || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder={selectedTheme === 'nascar' ? 'Keaty Cup 2026' : 'Golf Challenge 2026'}
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="comp-desc">Description (optional)</Label>
                <textarea
                  id="comp-desc"
                  value={formData.description || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  rows={2}
                  placeholder="Short description of this competition..."
                />
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="start-date">Start Date</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={formData.startDate || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, startDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="end-date">End Date</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={formData.endDate || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, endDate: e.target.value }))}
                  />
                </div>
              </div>

              {/* Metric Source */}
              <div className="space-y-1.5">
                <Label>Metric Source</Label>
                <Select
                  value={formData.metric || ''}
                  onValueChange={(v) =>
                    setFormData((prev) => ({
                      ...prev,
                      metric: v as any,
                      metricLabel: METRIC_OPTIONS.find((o) => o.value === v)?.label || v,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a metric" />
                  </SelectTrigger>
                  <SelectContent>
                    {METRIC_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Target Value (golf / threshold) */}
              {selectedTheme === 'golf' && (
                <div className="space-y-1.5">
                  <Label htmlFor="target-value">Daily Target (Par Value)</Label>
                  <Input
                    id="target-value"
                    type="number"
                    min={1}
                    value={formData.targetValue ?? 2}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, targetValue: Number(e.target.value) || 0 }))
                    }
                    placeholder="2"
                  />
                  <p className="text-xs text-muted-foreground">
                    The number of {formData.metricLabel || 'metrics'} per day that counts as par.
                  </p>
                </div>
              )}

              {/* Quick Config button */}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const defaults = getDefaultConfig(selectedTheme);
                    setFormData((prev) => ({
                      ...defaults,
                      name: prev.name || defaults.name,
                      description: prev.description || defaults.description,
                      startDate: prev.startDate || defaults.startDate,
                      endDate: prev.endDate || defaults.endDate,
                    }));
                  }}
                  className="text-xs gap-1"
                >
                  <Zap className="h-3 w-3" />
                  Auto-fill Defaults
                </Button>
                <span className="text-xs text-muted-foreground">Pre-fills scoring rules, prizes, audio, and commentary</span>
              </div>

              {/* Error */}
              {createError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{createError}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Footer */}
          {selectedTheme && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={creating || !formData.name}
              >
                {creating ? 'Creating...' : 'Create Competition'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
