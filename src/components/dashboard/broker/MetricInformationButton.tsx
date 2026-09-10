'use client';

import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export type ReportCardMetricInformation = {
  metricName: string;
  definition: string;
  dataSource: string;
  evaluationBasis: string;
  effectiveStartDate: string;
  asOfDate: string;
  originalGoal: number | null;
  originalCadence: string;
  weeklyPace: number | null;
  ytdGoal: number | null;
  ytdActual: number | null;
  catchUpNeeded: number | null;
  aheadBy: number | null;
  lastUpdated: string | null;
};

function numberValue(value: number | null, digits = 1) {
  return value == null ? 'Not Applicable' : value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function dateValue(value: string | null) {
  if (!value) return 'Not recorded';
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function MetricInformationButton({ information }: { information: ReportCardMetricInformation }) {
  const rows: Array<[string, string]> = [
    ['Definition', information.definition],
    ['Data source', information.dataSource],
    ['Evaluation basis', information.evaluationBasis],
    ['Report-card start date', dateValue(information.effectiveStartDate)],
    ['As-of date', dateValue(information.asOfDate)],
    ['Original goal', information.originalGoal == null ? 'Goal Not Configured' : `${numberValue(information.originalGoal)} per ${information.originalCadence}`],
    ['Weekly goal or pace', numberValue(information.weeklyPace)],
    ['Year-to-date goal', numberValue(information.ytdGoal)],
    ['Year-to-date actual', numberValue(information.ytdActual)],
    ['Catch-Up Needed', information.catchUpNeeded == null ? 'Not Applicable' : numberValue(information.catchUpNeeded)],
    ['Ahead By', information.aheadBy == null ? 'Not Applicable' : numberValue(information.aheadBy)],
    ['Last updated', dateValue(information.lastUpdated)],
  ];
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 rounded-full"
          aria-label={`More information about ${information.metricName}`}
          title={`More information about ${information.metricName}`}
        >
          <Info className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{information.metricName}</DialogTitle>
          <DialogDescription>Metric definition, source, and pacing details.</DialogDescription>
        </DialogHeader>
        <dl className="divide-y rounded-md border text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="grid gap-1 px-3 py-2 sm:grid-cols-[150px_1fr] sm:gap-3">
              <dt className="font-medium text-muted-foreground">{label}</dt>
              <dd className="break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
