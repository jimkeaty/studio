'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PipelineStatus = 'active' | 'set' | 'held' | 'ghost' | 'on_hold' | 'trash';
export type AppointmentCategory = 'buyer' | 'seller' | 'commercial' | 'hot';

export interface PipelineAppointment {
  id: string;
  date: string;
  contactName: string;
  category: AppointmentCategory;
  pipelineStatus: PipelineStatus;
  contactPhone?: string | null;
  contactEmail?: string | null;
  listingAddress?: string | null;
  priceRangeLow?: number | null;
  priceRangeHigh?: number | null;
  estimatedCommission?: number | null;
  notes?: string | null;
  scheduledAt?: string | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<PipelineStatus, { label: string; color: string; bg: string; dot: string }> = {
  active:  { label: 'Active',         color: 'text-green-700',  bg: 'bg-green-50 border-green-200',   dot: 'bg-green-500'  },
  set:     { label: 'Set',            color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',     dot: 'bg-blue-500'   },
  held:    { label: 'Held',           color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', dot: 'bg-purple-500' },
  ghost:   { label: 'Ghost / Follow', color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',   dot: 'bg-amber-500'  },
  on_hold: { label: 'On Hold',        color: 'text-gray-600',   bg: 'bg-gray-50 border-gray-200',     dot: 'bg-gray-400'   },
  trash:   { label: 'Trash',          color: 'text-red-600',    bg: 'bg-red-50 border-red-200',       dot: 'bg-red-400'    },
};

const CATEGORY_CONFIG: Record<AppointmentCategory, { label: string; color: string }> = {
  buyer:      { label: 'Buyer',      color: 'bg-blue-100 text-blue-700'   },
  seller:     { label: 'Seller',     color: 'bg-emerald-100 text-emerald-700' },
  commercial: { label: 'Commercial', color: 'bg-violet-100 text-violet-700' },
  hot:        { label: 'Hot',        color: 'bg-red-100 text-red-700'     },
};

const STATUS_ORDER: PipelineStatus[] = ['active', 'set', 'held', 'ghost', 'on_hold', 'trash'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number | null | undefined): string {
  if (!n) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function fmtFull$(n: number | null | undefined): string {
  if (!n) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function midpoint(lo?: number | null, hi?: number | null): number {
  if (lo && hi) return (lo + hi) / 2;
  if (lo) return lo;
  if (hi) return hi;
  return 0;
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────

interface ModalProps {
  agentId: string;
  viewAs?: string;
  year: number;
  initial?: PipelineAppointment | null;
  onClose: () => void;
  onSaved: () => void;
}

function AppointmentModal({ agentId, viewAs, year, initial, onClose, onSaved }: ModalProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    contactName: initial?.contactName ?? '',
    category: (initial?.category ?? 'buyer') as AppointmentCategory,
    pipelineStatus: (initial?.pipelineStatus ?? 'active') as PipelineStatus,
    date: initial?.date ?? new Date().toISOString().slice(0, 10),
    contactPhone: initial?.contactPhone ?? '',
    contactEmail: initial?.contactEmail ?? '',
    listingAddress: initial?.listingAddress ?? '',
    priceRangeLow: initial?.priceRangeLow ? String(initial.priceRangeLow) : '',
    priceRangeHigh: initial?.priceRangeHigh ? String(initial.priceRangeHigh) : '',
    estimatedCommission: initial?.estimatedCommission ? String(initial.estimatedCommission) : '',
    notes: initial?.notes ?? '',
  });

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.contactName.trim() || !form.date) {
      toast({ variant: 'destructive', title: 'Required', description: 'Name and date are required.' });
      return;
    }
    setSaving(true);
    try {
      const token = await user!.getIdToken();
      const payload: any = {
        contactName: form.contactName.trim(),
        category: form.category,
        pipelineStatus: form.pipelineStatus,
        status: form.pipelineStatus === 'held' ? 'held' : 'set',
        date: form.date,
        contactPhone: form.contactPhone || null,
        contactEmail: form.contactEmail || null,
        listingAddress: form.listingAddress || null,
        priceRangeLow: form.priceRangeLow ? Number(form.priceRangeLow) : null,
        priceRangeHigh: form.priceRangeHigh ? Number(form.priceRangeHigh) : null,
        estimatedCommission: form.estimatedCommission ? Number(form.estimatedCommission) : null,
        notes: form.notes || null,
      };
      if (viewAs) payload.viewAs = viewAs;

      const url = initial ? `/api/appointments/${initial.id}` : '/api/appointments';
      const method = initial ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Save failed');
      toast({ title: initial ? 'Appointment updated' : 'Appointment added' });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{initial ? 'Edit Appointment' : 'Add Appointment'}</h2>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Name + Category */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Contact Name *</label>
              <input value={form.contactName} onChange={e => set('contactName', e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder="Full name" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Type</label>
              <select value={form.category} onChange={e => set('category', e.target.value as AppointmentCategory)}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                <option value="buyer">Buyer</option>
                <option value="seller">Seller</option>
                <option value="commercial">Commercial</option>
                <option value="hot">Hot</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
              <select value={form.pipelineStatus} onChange={e => set('pipelineStatus', e.target.value as PipelineStatus)}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                {STATUS_ORDER.map(s => (
                  <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Appointment Date *</label>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>

          {/* Contact info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Phone</label>
              <input value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder="(555) 000-0000" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
              <input type="email" value={form.contactEmail} onChange={e => set('contactEmail', e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder="email@example.com" />
            </div>
          </div>

          {/* Property info */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Listing Address / What They&apos;re Looking For</label>
            <input value={form.listingAddress} onChange={e => set('listingAddress', e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="123 Main St or '3BR in Northside under $400K'" />
          </div>

          {/* Price range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Price Range Low ($)</label>
              <input type="number" value={form.priceRangeLow} onChange={e => set('priceRangeLow', e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder="200000" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Price Range High ($)</label>
              <input type="number" value={form.priceRangeHigh} onChange={e => set('priceRangeHigh', e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder="350000" />
            </div>
          </div>

          {/* Est. commission */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Est. Net Commission ($)</label>
            <input type="number" value={form.estimatedCommission} onChange={e => set('estimatedCommission', e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder="8500" />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
              placeholder="Any notes about this appointment…" />
          </div>
        </div>
        <div className="border-t px-6 py-4 flex justify-end gap-3 bg-gray-50">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Appointment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Appointment Card ─────────────────────────────────────────────────────────

interface CardProps {
  appt: PipelineAppointment;
  onStatusChange: (id: string, status: PipelineStatus) => void;
  onEdit: (appt: PipelineAppointment) => void;
  onDelete: (id: string) => void;
}

function AppointmentCard({ appt, onStatusChange, onEdit, onDelete }: CardProps) {
  const [expanded, setExpanded] = useState(false);
  const sc = STATUS_CONFIG[appt.pipelineStatus] ?? STATUS_CONFIG.active;
  const cc = CATEGORY_CONFIG[appt.category] ?? CATEGORY_CONFIG.buyer;
  const vol = midpoint(appt.priceRangeLow, appt.priceRangeHigh);

  return (
    <div className={cn('rounded-xl border bg-white shadow-sm overflow-hidden transition-all', appt.pipelineStatus === 'trash' && 'opacity-60')}>
      {/* Card header */}
      <div className="flex items-start justify-between gap-2 p-4 pb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border', sc.bg, sc.color)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', sc.dot)} />
              {sc.label}
            </span>
            <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', cc.color)}>
              {cc.label}
            </span>
          </div>
          <p className="mt-1.5 font-semibold text-sm text-gray-900 truncate">{appt.contactName}</p>
          {vol > 0 && (
            <p className="text-sm font-bold text-blue-700 mt-0.5">
              {appt.priceRangeLow && appt.priceRangeHigh
                ? `${fmt$(appt.priceRangeLow)} – ${fmt$(appt.priceRangeHigh)}`
                : fmt$(appt.priceRangeLow ?? appt.priceRangeHigh)}
            </p>
          )}
          {appt.estimatedCommission && (
            <p className="text-xs text-green-700 font-semibold mt-0.5">Est. Net: {fmtFull$(appt.estimatedCommission)}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <p className="text-[11px] text-gray-400">{appt.date}</p>
          <button onClick={() => setExpanded(e => !e)}
            className="text-[11px] text-blue-600 hover:underline font-medium">
            {expanded ? 'Less' : 'Details'}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-3 space-y-2 border-t pt-3 bg-gray-50/50">
          {appt.contactPhone && (
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span className="font-semibold w-14 shrink-0">Phone</span>
              <a href={`tel:${appt.contactPhone}`} className="text-blue-600 hover:underline">{appt.contactPhone}</a>
            </div>
          )}
          {appt.contactEmail && (
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span className="font-semibold w-14 shrink-0">Email</span>
              <a href={`mailto:${appt.contactEmail}`} className="text-blue-600 hover:underline truncate">{appt.contactEmail}</a>
            </div>
          )}
          {appt.listingAddress && (
            <div className="flex items-start gap-2 text-xs text-gray-600">
              <span className="font-semibold w-14 shrink-0 mt-0.5">Looking For</span>
              <span className="flex-1">{appt.listingAddress}</span>
            </div>
          )}
          {appt.notes && (
            <div className="flex items-start gap-2 text-xs text-gray-600">
              <span className="font-semibold w-14 shrink-0 mt-0.5">Notes</span>
              <span className="flex-1 whitespace-pre-wrap">{appt.notes}</span>
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button onClick={() => onEdit(appt)}
              className="text-xs font-medium text-blue-600 hover:underline">Edit</button>
            <span className="text-gray-200">|</span>
            <button onClick={() => onDelete(appt.id)}
              className="text-xs font-medium text-red-500 hover:underline">Delete</button>
          </div>
        </div>
      )}

      {/* Status tag buttons */}
      <div className="flex flex-wrap gap-1 px-3 pb-3 pt-1">
        {STATUS_ORDER.map(s => (
          <button
            key={s}
            onClick={() => onStatusChange(appt.id, s)}
            className={cn(
              'text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all',
              appt.pipelineStatus === s
                ? cn(STATUS_CONFIG[s].bg, STATUS_CONFIG[s].color, 'border-current ring-1 ring-current/30')
                : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400 hover:text-gray-600'
            )}
          >
            {STATUS_CONFIG[s].label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  agentId: string;
  viewAs?: string;
  initialYear?: number;
}

export function AppointmentsPipeline({ agentId, viewAs, initialYear }: Props) {
  const { user } = useUser();
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(initialYear ?? currentYear);
  const [appointments, setAppointments] = useState<PipelineAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<PipelineAppointment | null>(null);
  const [statusFilter, setStatusFilter] = useState<PipelineStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<AppointmentCategory | 'all'>('all');

  const fetchAppointments = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({ year: String(year) });
      if (viewAs) params.append('viewAs', viewAs);
      const res = await fetch(`/api/appointments?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setAppointments(data.appointments ?? []);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setLoading(false);
    }
  }, [user, year, viewAs, toast]);

  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

  async function handleStatusChange(id: string, status: PipelineStatus) {
    if (!user) return;
    // Optimistic update
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, pipelineStatus: status } : a));
    try {
      const token = await user.getIdToken();
      const payload: any = { pipelineStatus: status, status: status === 'held' ? 'held' : 'set' };
      if (viewAs) payload.viewAs = viewAs;
      const res = await fetch(`/api/appointments/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Status update failed', description: err.message });
      fetchAppointments(); // revert
    }
  }

  async function handleDelete(id: string) {
    if (!user || !confirm('Delete this appointment?')) return;
    try {
      const token = await user.getIdToken();
      const url = viewAs ? `/api/appointments/${id}?viewAs=${viewAs}` : `/api/appointments/${id}`;
      const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setAppointments(prev => prev.filter(a => a.id !== id));
      toast({ title: 'Appointment deleted' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Delete failed', description: err.message });
    }
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  // Exclude trash from pipeline totals
  const activeForTotals = appointments.filter(a => a.pipelineStatus !== 'trash');
  const totalVolume = activeForTotals.reduce((s, a) => s + midpoint(a.priceRangeLow, a.priceRangeHigh), 0);
  const totalEstNet = activeForTotals.reduce((s, a) => s + (a.estimatedCommission ?? 0), 0);

  // Status counts (excluding trash)
  const counts = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = appointments.filter(a => a.pipelineStatus === s).length;
    return acc;
  }, {} as Record<PipelineStatus, number>);

  // Filtered list for display
  const displayed = appointments.filter(a => {
    if (statusFilter !== 'all' && a.pipelineStatus !== statusFilter) return false;
    if (categoryFilter !== 'all' && a.category !== categoryFilter) return false;
    return true;
  });

  const yearOptions = Array.from({ length: 4 }, (_, i) => currentYear - i);

  return (
    <div className="space-y-4">
      {/* ── Pipeline Totals Header ────────────────────────────────────────── */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white p-5 shadow-xl">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h2 className="text-base font-bold tracking-tight">Appointments Pipeline</h2>
            <p className="text-xs text-blue-300 mt-0.5">All appointments for {year} — excluding trashed</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="rounded-lg bg-white/10 border border-white/20 text-white text-xs font-semibold px-3 py-1.5 focus:outline-none"
            >
              {yearOptions.map(y => <option key={y} value={y} className="text-gray-900">{y}</option>)}
            </select>
            <button
              onClick={() => { setEditTarget(null); setShowModal(true); }}
              className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 border border-white/30 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              + Add Appointment
            </button>
          </div>
        </div>

        {/* Totals row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl bg-white/10 border border-white/10 p-3 text-center">
            <p className="text-2xl font-black">{activeForTotals.length}</p>
            <p className="text-[11px] text-blue-300 mt-0.5">Total Appointments</p>
          </div>
          <div className="rounded-xl bg-white/10 border border-white/10 p-3 text-center">
            <p className="text-2xl font-black">{fmt$(totalVolume) === '—' ? '—' : fmt$(totalVolume)}</p>
            <p className="text-[11px] text-blue-300 mt-0.5">Total Volume</p>
          </div>
          <div className="rounded-xl bg-white/10 border border-white/10 p-3 text-center">
            <p className="text-2xl font-black text-green-300">{totalEstNet > 0 ? fmtFull$(totalEstNet) : '—'}</p>
            <p className="text-[11px] text-blue-300 mt-0.5">Est. Net Commission</p>
          </div>
          <div className="rounded-xl bg-white/10 border border-white/10 p-3 text-center">
            <p className="text-2xl font-black text-amber-300">{counts.ghost + counts.on_hold}</p>
            <p className="text-[11px] text-blue-300 mt-0.5">Need Follow-Up</p>
          </div>
        </div>

        {/* Status pill counts */}
        <div className="flex flex-wrap gap-2 mt-3">
          {STATUS_ORDER.filter(s => s !== 'trash').map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
              className={cn(
                'flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all',
                statusFilter === s
                  ? 'bg-white text-slate-900 border-white'
                  : 'bg-white/10 text-white/80 border-white/20 hover:bg-white/20'
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_CONFIG[s].dot)} />
              {STATUS_CONFIG[s].label}
              <span className="bg-white/20 rounded-full px-1.5 py-0.5 text-[10px] font-bold">{counts[s]}</span>
            </button>
          ))}
          {counts.trash > 0 && (
            <button
              onClick={() => setStatusFilter(statusFilter === 'trash' ? 'all' : 'trash')}
              className={cn(
                'flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all',
                statusFilter === 'trash'
                  ? 'bg-white text-slate-900 border-white'
                  : 'bg-white/10 text-white/80 border-white/20 hover:bg-white/20'
              )}
            >
              Trash
              <span className="bg-white/20 rounded-full px-1.5 py-0.5 text-[10px] font-bold">{counts.trash}</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-gray-500">Filter by type:</span>
        {(['all', 'buyer', 'seller', 'commercial', 'hot'] as const).map(c => (
          <button
            key={c}
            onClick={() => setCategoryFilter(c)}
            className={cn(
              'text-xs font-semibold px-3 py-1 rounded-full border transition-all',
              categoryFilter === c
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
            )}
          >
            {c === 'all' ? 'All Types' : CATEGORY_CONFIG[c].label}
          </button>
        ))}
        {(statusFilter !== 'all' || categoryFilter !== 'all') && (
          <button
            onClick={() => { setStatusFilter('all'); setCategoryFilter('all'); }}
            className="text-xs text-blue-600 hover:underline ml-1"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-gray-400">
          {displayed.length} of {appointments.length} appointment{appointments.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Cards Grid ────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-white p-4 space-y-2 animate-pulse">
              <div className="h-3 bg-gray-200 rounded w-1/3" />
              <div className="h-4 bg-gray-200 rounded w-2/3" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center">
          <div className="text-4xl mb-3">📅</div>
          <p className="font-semibold text-gray-700">
            {appointments.length === 0 ? `No appointments for ${year}` : 'No appointments match your filters'}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {appointments.length === 0
              ? 'Start building your pipeline by adding your first appointment.'
              : 'Try adjusting the status or type filters above.'}
          </p>
          {appointments.length === 0 && (
            <button
              onClick={() => { setEditTarget(null); setShowModal(true); }}
              className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + Add Appointment
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayed.map(appt => (
            <AppointmentCard
              key={appt.id}
              appt={appt}
              onStatusChange={handleStatusChange}
              onEdit={a => { setEditTarget(a); setShowModal(true); }}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* ── Modal ─────────────────────────────────────────────────────────── */}
      {showModal && (
        <AppointmentModal
          agentId={agentId}
          viewAs={viewAs}
          year={year}
          initial={editTarget}
          onClose={() => { setShowModal(false); setEditTarget(null); }}
          onSaved={fetchAppointments}
        />
      )}
    </div>
  );
}
