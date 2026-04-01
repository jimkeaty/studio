'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

// ── Tiny canvas confetti (no external deps) ─────────────────────────────────
function useConfetti(active: boolean, canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    if (!active || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const colors = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    const pieces: { x: number; y: number; r: number; d: number; color: string; tilt: number; tiltAngle: number; tiltAngleIncremental: number }[] = [];
    const count = 120;

    for (let i = 0; i < count; i++) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        r: Math.random() * 8 + 4,
        d: Math.random() * count + 11,
        color: colors[Math.floor(Math.random() * colors.length)],
        tilt: Math.floor(Math.random() * 10) - 10,
        tiltAngle: 0,
        tiltAngleIncremental: Math.random() * 0.07 + 0.05,
      });
    }

    let angle = 0;
    let rafId: number;

    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      angle += 0.01;
      pieces.forEach((p, i) => {
        p.tiltAngle += p.tiltAngleIncremental;
        p.y += (Math.cos(angle + p.d) + 2 + p.r / 2) * 0.9;
        p.x += Math.sin(angle) * 1.5;
        p.tilt = Math.sin(p.tiltAngle - i / 3) * 12;
        if (p.y > canvas.height) { p.x = Math.random() * canvas.width; p.y = -10; }
        ctx.beginPath();
        ctx.lineWidth = p.r / 2;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r / 4, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 4);
        ctx.stroke();
      });
      rafId = requestAnimationFrame(draw);
    }

    draw();
    const timer = setTimeout(() => cancelAnimationFrame(rafId), 4000);
    return () => { cancelAnimationFrame(rafId); clearTimeout(timer); };
  }, [active, canvasRef]);
}

// ── Closing Celebration Modal ────────────────────────────────────────────────
interface ClosingCelebrationProps {
  open: boolean;
  onClose: () => void;
  address: string;
  dealValue: number;
  agentNet: number;
  ytdNet: number;
  ytdGoal: number;
  closingsThisYear: number;
}

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

export function ClosingCelebrationModal({ open, onClose, address, dealValue, agentNet, ytdNet, ytdGoal, closingsThisYear }: ClosingCelebrationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useConfetti(open, canvasRef);

  if (!open) return null;

  const pct = ytdGoal > 0 ? Math.min(Math.round((ytdNet / ytdGoal) * 100), 100) : 0;
  const remaining = Math.max(ytdGoal - ytdNet, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* Confetti canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      {/* Modal */}
      <div className="relative z-10 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-8 text-center animate-in zoom-in-95 duration-300">
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-2xl font-black text-foreground mb-1">Deal Closed!</h2>
        <p className="text-muted-foreground text-sm mb-6 truncate">{address}</p>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4">
            <p className="text-xs text-green-700 dark:text-green-400 font-bold uppercase tracking-wide mb-1">Deal Value</p>
            <p className="text-xl font-black text-green-700 dark:text-green-300">{fmt(dealValue)}</p>
          </div>
          <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-4">
            <p className="text-xs text-blue-700 dark:text-blue-400 font-bold uppercase tracking-wide mb-1">You Earned</p>
            <p className="text-xl font-black text-blue-700 dark:text-blue-300">{fmt(agentNet)}</p>
          </div>
        </div>

        {/* YTD progress */}
        <div className="bg-muted/40 rounded-xl p-4 mb-6 text-left">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">YTD Progress</span>
            <span className="text-xs font-bold">{pct}% of goal</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{fmt(ytdNet)} earned</span>
            <span>{remaining > 0 ? `${fmt(remaining)} to go` : '🎯 Goal reached!'}</span>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-6">
          That&apos;s closing #{closingsThisYear} this year. Keep the momentum going! 🚀
        </p>

        <Button className="w-full" onClick={onClose}>
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}

// ── Tier Upgrade Modal ───────────────────────────────────────────────────────
interface TierUpgradeProps {
  open: boolean;
  onClose: () => void;
  oldTierName: string;
  newTierName: string;
  newSplit: number;
  ytdVolume: number;
}

export function TierUpgradeModal({ open, onClose, oldTierName, newTierName, newSplit, ytdVolume }: TierUpgradeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useConfetti(open, canvasRef);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      <div className="relative z-10 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-8 text-center animate-in zoom-in-95 duration-300">
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
        <div className="text-6xl mb-4">⬆️</div>
        <h2 className="text-2xl font-black text-foreground mb-1">Tier Upgrade!</h2>
        <p className="text-sm text-muted-foreground mb-6">
          You&apos;ve crossed a new commission threshold — your split just got better.
        </p>

        <div className="flex items-center justify-center gap-4 mb-6">
          <div className="rounded-xl bg-muted/50 border p-4 flex-1">
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-wide mb-1">Was</p>
            <p className="text-lg font-black text-muted-foreground">{oldTierName}</p>
          </div>
          <div className="text-2xl font-black text-primary">→</div>
          <div className="rounded-xl bg-green-50 dark:bg-green-950/30 border-2 border-green-400 p-4 flex-1">
            <p className="text-xs text-green-700 dark:text-green-400 font-bold uppercase tracking-wide mb-1">Now</p>
            <p className="text-lg font-black text-green-700 dark:text-green-300">{newTierName}</p>
          </div>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-6">
          <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
            Your new agent split: <span className="text-xl font-black">{newSplit}%</span>
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
            Every future deal this year pays you more. 🔥
          </p>
        </div>

        <p className="text-xs text-muted-foreground mb-6">
          YTD Volume: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(ytdVolume)}
        </p>

        <Button className="w-full" onClick={onClose}>
          Keep Closing! 🚀
        </Button>
      </div>
    </div>
  );
}
