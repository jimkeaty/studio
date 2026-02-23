// src/components/dashboard/broker/RecruitingAdminConsole.tsx
'use client';

import { useState, useEffect } from 'react';
import { useUser, useFirestore } from '@/firebase';
import {
  doc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, Link as LinkIcon, ShieldCheck } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { DatePickerWithPresets } from '@/components/ui/date-picker-with-presets';
import { getAllBrokerageRecruits } from '@/lib/referralsService';
import type { DownlineMember } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

// Admin UID check
const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

const referralSchema = z.object({
  recruitedAgentId: z.string().min(1, 'Recruit ID is required'),
  referrerAgentId: z.string().min(1, 'Referrer ID is required'),
  hireDate: z.date({ required_error: 'Hire date is required' }),
});
type ReferralFormValues = z.infer<typeof referralSchema>;

const StatusBadge = ({ status }: { status: string }) => {
  const variants: { [key: string]: string } = {
    qualified: 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30',
    in_progress: 'bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30',
    expired: 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30',
    missing_data: 'bg-gray-500/20 text-gray-700 dark:text-gray-400 border-gray-500/30',
  };
  const text: { [key: string]: string } = {
    qualified: 'Qualified',
    in_progress: 'In Progress',
    expired: 'Expired',
    missing_data: 'No Data',
  };
  return <Badge variant="outline" className={cn('font-normal', variants[status])}>{text[status]}</Badge>;
};

const GciProgressBar = ({ closed, pending, threshold }: { closed: number; pending: number; threshold: number; }) => {
    const closedPct = Math.min((closed / threshold) * 100, 100);
    const pendingPct = Math.min((pending / threshold) * 100, 100 - closedPct);
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="relative w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div className="absolute top-0 left-0 h-full bg-blue-500" style={{ width: `${closedPct}%` }} />
                        <div className="absolute top-0 h-full bg-yellow-400" style={{ left: `${closedPct}%`, width: `${pendingPct}%` }} />
                    </div>
                </TooltipTrigger>
                <TooltipContent>
                    <p>Closed: ${closed.toLocaleString()}</p>
                    <p>Pending: ${pending.toLocaleString()}</p>
                    <p>Remaining: ${Math.max(0, threshold - closed).toLocaleString()}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};

export function RecruitingAdminConsole() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recruits, setRecruits] = useState<DownlineMember[]>([]);
  const [loadingRecruits, setLoadingRecruits] = useState(true);

  const form = useForm<ReferralFormValues>({
    resolver: zodResolver(referralSchema),
  });

  useEffect(() => {
      if (!db || user?.uid !== ADMIN_UID) {
          setLoadingRecruits(false);
          return;
      }
      getAllBrokerageRecruits(db)
        .then(setRecruits)
        .catch(console.error)
        .finally(() => setLoadingRecruits(false));
  }, [db, user]);

  const onSubmit = async (values: ReferralFormValues) => {
    if (!user || !db || user.uid !== ADMIN_UID) return;
    setIsSubmitting(true);
    
    const batch = writeBatch(db);

    const referralRef = doc(db, 'agent_referrals', values.recruitedAgentId);
    batch.set(referralRef, {
        recruitedAgentId: values.recruitedAgentId,
        referrerAgentId: values.referrerAgentId,
        status: 'active',
        createdAt: serverTimestamp(),
        createdByUid: user.uid,
        updatedAt: serverTimestamp(),
        updatedByUid: user.uid,
    });

    const qualificationRef = doc(db, 'referral_qualifications', values.recruitedAgentId);
    const windowEndsAt = new Date(values.hireDate);
    windowEndsAt.setFullYear(windowEndsAt.getFullYear() + 1);

    batch.set(qualificationRef, {
        recruitedAgentId: values.recruitedAgentId,
        hireDate: values.hireDate,
        windowEndsAt: windowEndsAt,
        thresholdCompanyGciGross: 40000,
        companyGciGrossInWindow: 0, // Starts at 0
        status: 'in_progress',
        qualifiedAt: null,
        lastComputedAt: serverTimestamp(),
        computedByUid: user.uid,
    });

    try {
        await batch.commit();
        toast({ title: 'Success!', description: `Referral link created for ${values.recruitedAgentId}.` });
        form.reset();
        // Refresh recruit list
        getAllBrokerageRecruits(db).then(setRecruits);
    } catch (error: any) {
        console.error('Failed to create referral:', error);
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'Could not save the referral link.' });
    } finally {
        setIsSubmitting(false);
    }
  };
  
  if (user?.uid !== ADMIN_UID) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Recruiting Incentives – Admin Console
        </CardTitle>
        <CardDescription>
          Assign new agent referrals and monitor qualification status across the brokerage.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <section>
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <UserPlus /> Assign New Referral
          </h3>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                <FormField control={form.control} name="recruitedAgentId" render={({ field }) => (
                    <FormItem><FormLabel>New Recruit&apos;s Agent ID</FormLabel><FormControl><Input placeholder="e.g., jane-doe" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="referrerAgentId" render={({ field }) => (
                    <FormItem><FormLabel>Referring Agent&apos;s ID</FormLabel><FormControl><Input placeholder="e.g., john-smith" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="hireDate" render={({ field }) => (
                  <FormItem className="flex flex-col"><FormLabel>Recruit&apos;s Hire Date</FormLabel><FormControl><DatePickerWithPresets onSelect={field.onChange} /></FormControl><FormDescription>The 12-month qualification window starts from this date.</FormDescription><FormMessage /></FormItem>
              )} />
              <Button type="submit" disabled={isSubmitting}><LinkIcon className="mr-2 h-4 w-4" />{isSubmitting ? 'Saving...' : 'Create Referral Link'}</Button>
            </form>
          </Form>
        </section>
        
        <Separator />

        <section>
            <h3 className="text-lg font-semibold">Qualification Monitor & Payout Forecast</h3>
            <p className="text-sm text-muted-foreground mt-2">Real-time progress for all active recruits.</p>
            <div className="mt-4 border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Recruit</TableHead>
                            <TableHead>Referrer (T1 / T2)</TableHead>
                            <TableHead>Time Left</TableHead>
                            <TableHead className="w-[250px]">GCI Progress ($40k Goal)</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Payout</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loadingRecruits ? (
                            [...Array(3)].map((_, i) => <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell></TableRow>)
                        ) : recruits.length === 0 ? (
                            <TableRow><TableCell colSpan={6} className="h-24 text-center">No active recruits in the system.</TableCell></TableRow>
                        ) : (
                            recruits.map(r => (
                                <TableRow key={r.agentId}>
                                    <TableCell className="font-medium">{r.displayName}</TableCell>
                                    <TableCell><p>{r.referrerId}</p><p className="text-xs text-muted-foreground">{r.uplineId}</p></TableCell>
                                    <TableCell>{r.qualificationProgress?.windowEndsAt ? formatDistanceToNowStrict(r.qualificationProgress.windowEndsAt) : 'N/A'}</TableCell>
                                    <TableCell>
                                        {r.qualificationProgress ? (
                                             <div className="flex flex-col">
                                                <span className="font-semibold text-sm">${r.qualificationProgress.closedCompanyGciGrossInWindow.toLocaleString()}</span>
                                                <GciProgressBar closed={r.qualificationProgress.closedCompanyGciGrossInWindow} pending={r.qualificationProgress.pendingCompanyGciGrossInWindow} threshold={40000} />
                                                <span className="text-xs text-muted-foreground mt-1">${r.qualificationProgress.remainingToThreshold.toLocaleString()} to goal</span>
                                             </div>
                                        ) : <span className="text-xs text-muted-foreground">No data</span>}
                                    </TableCell>
                                    <TableCell><StatusBadge status={r.qualificationProgress?.status ?? 'missing_data'} /></TableCell>
                                    <TableCell className="text-right font-semibold">${r.qualificationProgress?.annualPayout ?? 0}</TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </section>
      </CardContent>
    </Card>
  );
}
