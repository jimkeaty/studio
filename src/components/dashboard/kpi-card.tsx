import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { AnimatedNumber } from '@/components/ui/animated-number';

// ─── Metric explanations ──────────────────────────────────────────────────────
const METRIC_TOOLTIPS: Record<string, { what: string; how: string }> = {
  'Calls': {
    what: 'Total outbound and inbound calls logged in your Daily Tracker this month.',
    how: 'Graded against your monthly calls goal set in your Business Plan. A = 100%+, B = 80–99%, C = 60–79%, D = 40–59%, F = below 40%.',
  },
  'Appointments': {
    what: 'Total buyer, seller, and referral appointments logged in your Daily Tracker this month.',
    how: 'Graded against your monthly appointments goal. Each appointment represents a face-to-face or virtual meeting with a prospect or client.',
  },
  'Leads': {
    what: 'New leads added or engaged this month, as logged in your Daily Tracker.',
    how: 'Graded against your monthly leads goal. Includes any new contact added to your pipeline.',
  },
  'Engagements': {
    what: 'Total meaningful client touches this month — calls, texts, emails, and in-person meetings.',
    how: 'Graded against your monthly engagements goal. Consistent engagement is the strongest predictor of future closings.',
  },
  'Closings': {
    what: 'Transactions marked Closed this month.',
    how: 'Graded against your monthly closings goal derived from your annual income target in your Business Plan.',
  },
  'Volume': {
    what: 'Total closed sales volume (sum of all sale prices) this month.',
    how: 'Graded against your monthly volume goal. Volume = sum of all closed transaction sale prices.',
  },
  'GCI': {
    what: 'Gross Commission Income earned this month — your share of the commission before broker split.',
    how: 'GCI = Sale Price × Commission % − Seller Concessions. Graded against your monthly GCI goal.',
  },
  'Net Income': {
    what: 'Your take-home commission after the broker split this month.',
    how: 'Net Income = GCI × Your Agent Split %. This is the money deposited to you after brokerage fees.',
  },
};

const getTooltip = (title: string) => {
  // Try exact match first, then partial match
  if (METRIC_TOOLTIPS[title]) return METRIC_TOOLTIPS[title];
  const key = Object.keys(METRIC_TOOLTIPS).find(k => title.toLowerCase().includes(k.toLowerCase()));
  return key ? METRIC_TOOLTIPS[key] : null;
};

interface KpiCardProps {
  title: string;
  actual: number;
  target: number;
  performance: number; // 0-100+
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  isGracePeriod: boolean;
}

export function KpiCard({ title, actual, target, performance, grade, isGracePeriod }: KpiCardProps) {

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A': return 'bg-green-500/90';
      case 'B': return 'bg-primary';
      case 'C': return 'bg-yellow-500/90';
      case 'D': return 'bg-orange-500/80';
      case 'F': return 'bg-red-500/90';
      default: return 'bg-secondary';
    }
  };

  const finalGrade = isGracePeriod ? 'A' : grade;
  const tip = getTooltip(title);

  return (
    <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {tip && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-muted-foreground cursor-help flex-shrink-0" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px] text-xs space-y-1.5">
                  <p className="font-semibold text-foreground">{title}</p>
                  <p className="text-muted-foreground leading-relaxed">{tip.what}</p>
                  <div className="border-t pt-1.5">
                    <p className="font-medium text-foreground/80 mb-0.5">How it&apos;s graded:</p>
                    <p className="text-muted-foreground leading-relaxed">{tip.how}</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline justify-between">
            <div className="text-xl font-bold">
              <AnimatedNumber value={actual} formatter={(n) => Math.round(n).toLocaleString()} />
            </div>
            <Badge className={cn('text-primary-foreground text-6xl px-4', getGradeColor(finalGrade))}>
                {finalGrade}
            </Badge>
        </div>
        {isGracePeriod ? (
          <div className="flex items-center gap-1 mt-1">
            <span className="text-xs text-muted-foreground">Grace Period</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[260px] text-xs">
                  <p className="font-semibold mb-1">Grace Period (first 5 business days)</p>
                  <p>You automatically receive an &quot;A&quot; grade during your first week. This gives you time to establish a baseline for your activity metrics. After 5 working days, grades will reflect your actual performance vs goals.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {performance}% of target ({target.toLocaleString()})
          </p>
        )}
        <Progress value={isGracePeriod ? 100 : Math.min(performance, 100)} className="mt-2 h-2" />
      </CardContent>
    </Card>
  );
}
