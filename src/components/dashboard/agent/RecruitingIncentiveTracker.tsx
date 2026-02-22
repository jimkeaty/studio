// src/components/dashboard/agent/RecruitingIncentiveTracker.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { getFullDownline } from '@/lib/referralsService';
import type { DownlineMember } from '@/lib/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertCircle,
  Users,
  Award,
  DollarSign,
  Timer,
  CheckCircle,
  XCircle,
  TrendingUp,
  MinusCircle
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const SummaryCard = ({
  icon: Icon,
  title,
  value,
  description,
}: {
  icon: React.ElementType;
  title: string;
  value: string | number;
  description: string;
}) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </CardContent>
  </Card>
);

const StatusBadge = ({
  status,
}: {
  status: 'qualified' | 'in_progress' | 'expired' | 'missing_data';
}) => {
  const variants = {
    qualified: 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30',
    in_progress: 'bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30',
    expired: 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30',
    missing_data: 'bg-gray-500/20 text-gray-700 dark:text-gray-400 border-gray-500/30',
  };
  const text = {
    qualified: 'Qualified',
    in_progress: 'In Progress',
    expired: 'Expired',
    missing_data: 'No Data',
  };
  return (
    <Badge variant="outline" className={cn('font-normal', variants[status])}>
      {text[status]}
    </Badge>
  );
};


export function RecruitingIncentiveTracker() {
  const { user } = useUser();
  const db = useFirestore();
  const [downline, setDownline] = useState<DownlineMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !db) {
        setLoading(false);
        return;
    };

    setLoading(true);
    getFullDownline(db, user.uid)
      .then(setDownline)
      .catch((err) => {
        console.error(err);
        setError('Failed to load recruiting data. Please try again later.');
      })
      .finally(() => setLoading(false));
  }, [user, db]);

  const summary = useMemo(() => {
    const now = new Date();
    return downline.reduce(
      (acc, member) => {
        if (member.tier === 1) acc.tier1Count++;
        if (member.tier === 2) acc.tier2Count++;
        if (member.qualificationProgress?.status === 'qualified') {
          acc.qualifiedCount++;
        }
        if (
          member.qualificationProgress?.status === 'in_progress' &&
          member.qualificationProgress.windowEndsAt &&
          (member.qualificationProgress.windowEndsAt.getTime() - now.getTime()) /
            (1000 * 60 * 60 * 24) <=
            60
        ) {
          acc.expiringSoonCount++;
        }
        return acc;
      },
      {
        tier1Count: 0,
        tier2Count: 0,
        qualifiedCount: 0,
        expiringSoonCount: 0,
      }
    );
  }, [downline]);

  if (loading) {
    return (
        <Card>
            <CardHeader><Skeleton className="h-6 w-1/3" /></CardHeader>
            <CardContent><Skeleton className="h-48 w-full" /></CardContent>
        </Card>
    );
  }
  
  if (error) {
     return (
        <Card>
            <CardHeader><CardTitle>Recruiting Tracker</CardTitle></CardHeader>
            <CardContent className="text-center text-red-500">
                <AlertCircle className="mx-auto h-8 w-8 mb-2" />
                <p>{error}</p>
            </CardContent>
        </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recruiting Incentive Tracker</CardTitle>
        <CardDescription>
          Track the progress of agents you've referred and your potential annual incentive.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard
            icon={Users}
            title="Tier 1 Recruits"
            value={summary.tier1Count}
            description="Directly referred agents"
          />
          <SummaryCard
            icon={Users}
            title="Tier 2 Recruits"
            value={summary.tier2Count}
            description="Indirectly referred agents"
          />
          <SummaryCard
            icon={Award}
            title="Qualified Agents"
            value={summary.qualifiedCount}
            description="Met $40k GCI threshold"
          />
          <SummaryCard
            icon={DollarSign}
            title="Annual Payout"
            value={`$${(summary.qualifiedCount * 500).toLocaleString()}`}
            description="Your current locked-in incentive"
          />
        </div>

        {downline.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
                <p>You do not have any referred agents in your downline yet.</p>
                <p className="text-sm">Start recruiting to build your passive income stream.</p>
            </div>
        ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Time Left</TableHead>
              <TableHead>GCI Progress ($40k Goal)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Your Payout</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {downline.map((member) => (
              <TableRow key={member.agentId}>
                <TableCell className="font-medium">{member.displayName}</TableCell>
                <TableCell>{member.tier}</TableCell>
                <TableCell>
                  {member.qualificationProgress?.timeRemainingDays !== null ? (
                    <TooltipProvider>
                       <Tooltip>
                           <TooltipTrigger>
                                <span className={cn(member.qualificationProgress!.timeRemainingDays <= 60 && "text-destructive font-semibold")}>
                                    {formatDistanceToNowStrict(member.qualificationProgress!.windowEndsAt!)}
                                </span>
                           </TooltipTrigger>
                           <TooltipContent>
                               <p>Hire Date: {member.hireDate ? format(member.hireDate, 'PPP') : 'N/A'}</p>
                               <p>Window Ends: {member.qualificationProgress!.windowEndsAt ? format(member.qualificationProgress!.windowEndsAt, 'PPP') : 'N/A'}</p>
                           </TooltipContent>
                       </Tooltip>
                    </TooltipProvider>
                  ) : (
                    'N/A'
                  )}
                </TableCell>
                <TableCell>
                  {member.qualificationProgress && member.qualificationProgress.status !== 'missing_data' ? (
                     <div className="flex flex-col">
                        <span className="font-semibold text-sm">
                            ${member.qualificationProgress.companyGciGrossInWindow.toLocaleString()}
                        </span>
                        <Progress value={member.qualificationProgress.progressPercentage} className="h-2 mt-1" />
                        <span className="text-xs text-muted-foreground mt-1">
                            ${member.qualificationProgress.remainingToThreshold.toLocaleString()} to goal
                        </span>
                     </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">Missing GCI Data</span>
                  )}
                </TableCell>
                <TableCell>
                   <StatusBadge status={member.qualificationProgress?.status ?? 'missing_data'} />
                </TableCell>
                <TableCell className="text-right font-semibold">
                   ${member.qualificationProgress?.annualPayout ?? 0}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        )}
      </CardContent>
    </Card>
  );
}
