'use client';

/**
 * AppointmentsKanban — Kanban board view for the Appointments Pipeline.
 * Columns map 1-to-1 with PipelineStatus values (excluding trash).
 * Drag-and-drop is implemented with the HTML5 Drag API (no extra deps).
 */

import React, { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { PipelineAppointment, PipelineStatus, AppointmentCategory } from './AppointmentsPipeline';
import { GripVertical, Pencil, Trash2, Phone, Mail, MapPin, DollarSign } from 'lucide-react';

// ─── Config (mirrors AppointmentsPipeline STATUS_CONFIG) ──────────────────────

const KANBAN_COLUMNS: {
  status: PipelineStatus;
  label: string;
  headerBg: string;
  headerText: string;
  colBg: string;
  dot: string;
  accent: string;
}[] = [
  {
    status: 'active',
    label: 'Active',
    headerBg: 'bg-green-600',
    headerText: 'text-white',
    colBg: 'bg-green-50/60',
    dot: 'bg-green-500',
    accent: 'border-green-300',
  },
  {
    status: 'set',
    label: 'Appt Set',
    headerBg: 'bg-blue-600',
    headerText: 'text-white',
    colBg: 'bg-blue-50/60',
    dot: 'bg-blue-500',
    accent: 'border-blue-300',
  },
  {
    status: 'held',
    label: 'Appt Held',
    headerBg: 'bg-purple-600',
    headerText: 'text-white',
    colBg: 'bg-purple-50/60',
    dot: 'bg-purple-500',
    accent: 'border-purple-300',
  },
  {
    status: 'contract_written',
    label: 'Under Contract',
    headerBg: 'bg-orange-500',
    headerText: 'text-white',
    colBg: 'bg-orange-50/60',
    dot: 'bg-orange-500',
    accent: 'border-orange-300',
  },
  {
    status: 'closed',
    label: 'Closed',
    headerBg: 'bg-teal-600',
    headerText: 'text-white',
    colBg: 'bg-teal-50/60',
    dot: 'bg-teal-500',
    accent: 'border-teal-300',
  },
  {
    status: 'ghost',
    label: 'Ghost / Follow-Up',
    headerBg: 'bg-amber-500',
    headerText: 'text-white',
    colBg: 'bg-amber-50/60',
    dot: 'bg-amber-500',
    accent: 'border-amber-300',
  },
  {
    status: 'on_hold',
    label: 'On Hold',
    headerBg: 'bg-gray-500',
    headerText: 'text-white',
    colBg: 'bg-gray-50/60',
    dot: 'bg-gray-400',
    accent: 'border-gray-300',
  },
];

const CATEGORY_BADGE: Record<AppointmentCategory, string> = {
  buyer:      'bg-blue-100 text-blue-700',
  seller:     'bg-emerald-100 text-emerald-700',
  commercial: 'bg-violet-100 text-violet-700',
  hot:        'bg-red-100 text-red-700',
  both:       'bg-indigo-100 text-indigo-700',
};

const CATEGORY_LABEL: Record<AppointmentCategory, string> = {
  buyer: 'Buyer',
  seller: 'Seller',
  commercial: 'Commercial',
  hot: 'Hot',
  both: 'Buyer + Seller',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number | null | undefined): string {
  if (!n) return '';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function midpoint(lo?: number | null, hi?: number | null): number {
  if (lo && hi) return (lo + hi) / 2;
  if (lo) return lo;
  if (hi) return hi;
  return 0;
}

function colTotal(appts: PipelineAppointment[]): number {
  return appts.reduce((s, a) => s + midpoint(a.priceRangeLow, a.priceRangeHigh), 0);
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────

interface KanbanCardProps {
  appt: PipelineAppointment;
  onEdit: (appt: PipelineAppointment) => void;
  onDelete: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}

function KanbanCard({ appt, onEdit, onDelete, onDragStart, onDragEnd, isDragging }: KanbanCardProps) {
  const vol = midpoint(appt.priceRangeLow, appt.priceRangeHigh);

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, appt.id)}
      onDragEnd={onDragEnd}
      className={cn(
        'group relative rounded-xl border bg-white shadow-sm cursor-grab active:cursor-grabbing transition-all select-none',
        'hover:shadow-md hover:-translate-y-0.5',
        isDragging && 'opacity-40 scale-95 shadow-lg ring-2 ring-blue-400',
      )}
    >
      {/* Drag handle */}
      <div className="absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-300 group-hover:text-gray-400 transition-colors">
        <GripVertical className="h-4 w-4" />
      </div>

      <div className="pl-6 pr-3 pt-3 pb-2">
        {/* Type badge + date */}
        <div className="flex items-center justify-between gap-1 mb-1.5">
          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', CATEGORY_BADGE[appt.category])}>
            {CATEGORY_LABEL[appt.category]}
          </span>
          <span className="text-[10px] text-gray-400 shrink-0">{appt.date}</span>
        </div>

        {/* Name */}
        <p className="font-semibold text-sm text-gray-900 leading-snug">{appt.contactName}</p>

        {/* Price range */}
        {vol > 0 && (
          <p className="text-xs font-bold text-blue-700 mt-0.5">
            {appt.priceRangeLow && appt.priceRangeHigh
              ? `${fmt$(appt.priceRangeLow)} – ${fmt$(appt.priceRangeHigh)}`
              : fmt$(appt.priceRangeLow ?? appt.priceRangeHigh)}
          </p>
        )}

        {/* Est. commission */}
        {appt.estimatedCommission ? (
          <div className="flex items-center gap-1 mt-0.5">
            <DollarSign className="h-3 w-3 text-green-600" />
            <span className="text-[11px] text-green-700 font-semibold">
              Est. {fmt$(appt.estimatedCommission)}
            </span>
          </div>
        ) : null}

        {/* Contact info row */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {appt.contactPhone && (
            <a href={`tel:${appt.contactPhone}`} onClick={e => e.stopPropagation()}
              className="flex items-center gap-0.5 text-[10px] text-blue-600 hover:underline">
              <Phone className="h-2.5 w-2.5" />
              {appt.contactPhone}
            </a>
          )}
          {appt.contactEmail && (
            <a href={`mailto:${appt.contactEmail}`} onClick={e => e.stopPropagation()}
              className="flex items-center gap-0.5 text-[10px] text-blue-600 hover:underline truncate max-w-[120px]">
              <Mail className="h-2.5 w-2.5" />
              {appt.contactEmail}
            </a>
          )}
        </div>

        {/* Address */}
        {appt.listingAddress && (
          <div className="flex items-start gap-1 mt-1">
            <MapPin className="h-2.5 w-2.5 text-gray-400 mt-0.5 shrink-0" />
            <span className="text-[10px] text-gray-500 line-clamp-1">{appt.listingAddress}</span>
          </div>
        )}

        {/* Notes snippet */}
        {appt.notes && (
          <p className="text-[10px] text-gray-400 mt-1 line-clamp-2 italic">{appt.notes}</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 px-3 pb-2 pt-1 border-t border-gray-100">
        <button
          onClick={e => { e.stopPropagation(); onEdit(appt); }}
          className="flex items-center gap-1 text-[10px] font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded px-1.5 py-0.5 transition-colors"
        >
          <Pencil className="h-2.5 w-2.5" /> Edit
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(appt.id); }}
          className="flex items-center gap-1 text-[10px] font-medium text-red-500 hover:text-red-700 hover:bg-red-50 rounded px-1.5 py-0.5 transition-colors"
        >
          <Trash2 className="h-2.5 w-2.5" /> Delete
        </button>
      </div>
    </div>
  );
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  col: typeof KANBAN_COLUMNS[number];
  appointments: PipelineAppointment[];
  onEdit: (appt: PipelineAppointment) => void;
  onDelete: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDrop: (status: PipelineStatus) => void;
  draggingId: string | null;
  isOver: boolean;
  onDragOver: (status: PipelineStatus) => void;
  onDragLeave: () => void;
}

function KanbanColumn({
  col, appointments, onEdit, onDelete,
  onDragStart, onDragEnd, onDrop, draggingId,
  isOver, onDragOver, onDragLeave,
}: KanbanColumnProps) {
  const total = colTotal(appointments);

  return (
    <div className="flex flex-col min-w-[240px] w-[240px] shrink-0">
      {/* Column header */}
      <div className={cn('rounded-t-xl px-3 py-2.5', col.headerBg)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-white/60" />
            <span className={cn('text-xs font-bold', col.headerText)}>{col.label}</span>
          </div>
          <span className={cn(
            'text-[11px] font-bold px-2 py-0.5 rounded-full',
            'bg-white/20 text-white'
          )}>
            {appointments.length}
          </span>
        </div>
        {total > 0 && (
          <p className="text-[10px] text-white/70 mt-0.5 font-medium">{fmt$(total)} pipeline</p>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); onDragOver(col.status); }}
        onDragLeave={onDragLeave}
        onDrop={e => { e.preventDefault(); onDrop(col.status); }}
        className={cn(
          'flex-1 rounded-b-xl border-x border-b p-2 space-y-2 min-h-[120px] transition-all',
          col.colBg,
          col.accent,
          isOver && 'ring-2 ring-inset ring-blue-400 bg-blue-50/80',
        )}
      >
        {appointments.length === 0 && !isOver && (
          <div className="flex items-center justify-center h-16 text-[11px] text-gray-400 italic">
            Drop here
          </div>
        )}
        {appointments.map(appt => (
          <KanbanCard
            key={appt.id}
            appt={appt}
            onEdit={onEdit}
            onDelete={onDelete}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            isDragging={draggingId === appt.id}
          />
        ))}
        {isOver && (
          <div className="h-1 rounded-full bg-blue-400 animate-pulse" />
        )}
      </div>
    </div>
  );
}

// ─── Main Kanban Board ────────────────────────────────────────────────────────

interface AppointmentsKanbanProps {
  appointments: PipelineAppointment[];
  categoryFilter: AppointmentCategory | 'all';
  onStatusChange: (id: string, status: PipelineStatus) => void;
  onEdit: (appt: PipelineAppointment) => void;
  onDelete: (id: string) => void;
  loading?: boolean;
}

export function AppointmentsKanban({
  appointments,
  categoryFilter,
  onStatusChange,
  onEdit,
  onDelete,
  loading,
}: AppointmentsKanbanProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<PipelineStatus | null>(null);
  const dragIdRef = useRef<string | null>(null);

  function handleDragStart(e: React.DragEvent, id: string) {
    dragIdRef.current = id;
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setOverStatus(null);
    dragIdRef.current = null;
  }

  function handleDrop(status: PipelineStatus) {
    const id = dragIdRef.current;
    if (!id) return;
    const appt = appointments.find(a => a.id === id);
    if (appt && appt.pipelineStatus !== status) {
      onStatusChange(id, status);
    }
    setDraggingId(null);
    setOverStatus(null);
    dragIdRef.current = null;
  }

  // Filter by category (trash excluded from board)
  const filtered = appointments.filter(a => {
    if (a.pipelineStatus === 'trash') return false;
    if (categoryFilter !== 'all' && a.category !== categoryFilter) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-4">
        {KANBAN_COLUMNS.map(col => (
          <div key={col.status} className="flex flex-col min-w-[240px] w-[240px] shrink-0">
            <div className={cn('rounded-t-xl px-3 py-2.5 animate-pulse', col.headerBg, 'opacity-60')}>
              <div className="h-4 bg-white/30 rounded w-2/3" />
            </div>
            <div className={cn('rounded-b-xl border-x border-b p-2 space-y-2 min-h-[200px]', col.colBg, col.accent)}>
              {[1, 2].map(i => (
                <div key={i} className="rounded-xl border bg-white p-3 space-y-2 animate-pulse">
                  <div className="h-3 bg-gray-200 rounded w-1/3" />
                  <div className="h-4 bg-gray-200 rounded w-2/3" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-3 min-w-max">
        {KANBAN_COLUMNS.map(col => {
          const colAppts = filtered.filter(a => a.pipelineStatus === col.status);
          return (
            <KanbanColumn
              key={col.status}
              col={col}
              appointments={colAppts}
              onEdit={onEdit}
              onDelete={onDelete}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDrop={handleDrop}
              draggingId={draggingId}
              isOver={overStatus === col.status}
              onDragOver={setOverStatus}
              onDragLeave={() => setOverStatus(null)}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-4 flex-wrap">
        <span className="text-[11px] text-gray-400 font-medium">Drag cards between columns to update status</span>
        <span className="text-[11px] text-gray-300">·</span>
        <span className="text-[11px] text-gray-400">Pipeline value = avg of price range midpoints</span>
      </div>
    </div>
  );
}
