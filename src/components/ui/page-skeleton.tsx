'use client';

import { cn } from '@/lib/utils';

/** A single shimmer bar */
function ShimmerBar({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-md bg-muted', className)} />
  );
}

/** Full-page dashboard skeleton — matches the SmartHeader + cards layout */
export function DashboardPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Smart Header skeleton */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-800 to-slate-700 p-6 animate-pulse">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <ShimmerBar className="h-5 w-48 bg-white/20" />
            <ShimmerBar className="h-8 w-64 bg-white/30" />
            <ShimmerBar className="h-4 w-36 bg-white/15" />
          </div>
          <ShimmerBar className="h-10 w-28 rounded-lg bg-white/20" />
        </div>
        <div className="mt-4 flex gap-4">
          {[1, 2, 3].map(i => (
            <ShimmerBar key={i} className="h-14 w-32 rounded-xl bg-white/10" />
          ))}
        </div>
      </div>

      {/* Quick action bar skeleton */}
      <div className="flex gap-3">
        {[1, 2, 3, 4].map(i => (
          <ShimmerBar key={i} className="h-12 flex-1 rounded-xl" />
        ))}
      </div>

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-3 animate-pulse">
            <ShimmerBar className="h-3 w-20" />
            <ShimmerBar className="h-7 w-16" />
            <ShimmerBar className="h-2 w-full rounded-full" />
          </div>
        ))}
      </div>

      {/* Report card skeleton */}
      <div className="rounded-xl border bg-card p-5 space-y-4 animate-pulse">
        <ShimmerBar className="h-5 w-40" />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-xl border p-4 space-y-3">
              <div className="flex justify-between items-center">
                <ShimmerBar className="h-4 w-24" />
                <ShimmerBar className="h-12 w-12 rounded-full" />
              </div>
              <ShimmerBar className="h-6 w-28" />
              <ShimmerBar className="h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Tracker page skeleton */
export function TrackerPageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <ShimmerBar className="h-8 w-48" />
        <ShimmerBar className="h-10 w-32 rounded-lg" />
      </div>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 35 }).map((_, i) => (
          <ShimmerBar key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-xl border p-4 space-y-2">
            <ShimmerBar className="h-4 w-20" />
            <ShimmerBar className="h-8 w-12" />
            <ShimmerBar className="h-2 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Leaderboard skeleton */
export function LeaderboardSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <ShimmerBar className="h-10 w-64 mb-6" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl border bg-card p-4">
          <ShimmerBar className="h-8 w-8 rounded-full flex-shrink-0" />
          <ShimmerBar className="h-10 w-10 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <ShimmerBar className="h-4 w-32" />
            <ShimmerBar className="h-2 w-full rounded-full" />
          </div>
          <ShimmerBar className="h-6 w-20 flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Transactions table skeleton */
export function TransactionTableSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="flex gap-3 mb-4">
        <ShimmerBar className="h-10 flex-1 rounded-lg" />
        <ShimmerBar className="h-10 w-32 rounded-lg" />
        <ShimmerBar className="h-10 w-32 rounded-lg" />
      </div>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl border bg-card p-4">
          <ShimmerBar className="h-4 w-4 rounded flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <ShimmerBar className="h-4 w-48" />
            <ShimmerBar className="h-3 w-32" />
          </div>
          <ShimmerBar className="h-6 w-20 rounded-full flex-shrink-0" />
          <ShimmerBar className="h-4 w-24 flex-shrink-0" />
          <ShimmerBar className="h-4 w-20 flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Generic card grid skeleton */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card overflow-hidden">
          <ShimmerBar className="h-16 w-full rounded-none" />
          <div className="p-4 space-y-2">
            <ShimmerBar className="h-4 w-3/4" />
            <ShimmerBar className="h-3 w-1/2" />
            <ShimmerBar className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
