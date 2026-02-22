// src/components/dashboard/broker/RecruitingAdminConsole.tsx
'use client';

import { useState, useEffect } from 'react';
import { useUser, useFirestore } from '@/firebase';
import {
  collection,
  doc,
  setDoc,
  serverTimestamp,
  getDocs,
  query,
  where,
  writeBatch,
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
import { DatePickerWithPresets } from '@/components/ui/date-picker-with-presets'; // Assuming this exists or will be created

// Admin UID check
const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

const referralSchema = z.object({
  recruitedAgentId: z.string().min(1, 'Recruit ID is required'),
  referrerAgentId: z.string().min(1, 'Referrer ID is required'),
  hireDate: z.date({ required_error: 'Hire date is required' }),
});
type ReferralFormValues = z.infer<typeof referralSchema>;

export function RecruitingAdminConsole() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ReferralFormValues>({
    resolver: zodResolver(referralSchema),
  });

  const onSubmit = async (values: ReferralFormValues) => {
    if (!user || !db) return;
    setIsSubmitting(true);
    
    const batch = writeBatch(db);

    // 1. Create the agent_referrals document
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

    // 2. Create the referral_qualifications document
    const qualificationRef = doc(db, 'referral_qualifications', values.recruitedAgentId);
    const windowEndsAt = new Date(values.hireDate);
    windowEndsAt.setFullYear(windowEndsAt.getFullYear() + 1);

    batch.set(qualificationRef, {
        recruitedAgentId: values.recruitedAgentId,
        hireDate: values.hireDate,
        windowEndsAt: windowEndsAt,
        thresholdCompanyGciGross: 40000,
        companyGciGrossInWindow: 0,
        status: 'in_progress',
        qualifiedAt: null,
        lastComputedAt: serverTimestamp(),
        computedByUid: user.uid,
    });

    try {
        await batch.commit();
        toast({
            title: 'Success!',
            description: `Referral link created for ${values.recruitedAgentId}.`,
        });
        form.reset();
    } catch (error: any) {
        console.error('Failed to create referral:', error);
        toast({
            variant: 'destructive',
            title: 'Error',
            description: error.message || 'Could not save the referral link.',
        });
    } finally {
        setIsSubmitting(false);
    }
  };
  
  // Render nothing if not an admin
  if (user?.uid !== ADMIN_UID) {
    return null;
  }

  // NOTE: The monitor and forecast sections are omitted for this build
  // as they require more complex queries and data aggregation.

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Recruiting Incentives – Admin Console
        </CardTitle>
        <CardDescription>
          Assign new agent referrals and monitor qualification status.
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
                <FormField
                  control={form.control}
                  name="recruitedAgentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Recruit&apos;s Agent ID</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., jane-doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="referrerAgentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Referring Agent&apos;s ID</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., john-smith" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
                <FormField
                    control={form.control}
                    name="hireDate"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                        <FormLabel>Recruit&apos;s Hire Date</FormLabel>
                            <FormControl>
                                <DatePickerWithPresets onSelect={field.onChange} />
                            </FormControl>
                        <FormDescription>
                            The 12-month qualification window starts from this date.
                        </FormDescription>
                        <FormMessage />
                        </FormItem>
                    )}
                />

              <Button type="submit" disabled={isSubmitting}>
                <LinkIcon className="mr-2 h-4 w-4" />
                {isSubmitting ? 'Saving...' : 'Create Referral Link'}
              </Button>
            </form>
          </Form>
        </section>
        
        <Separator />

        <section>
            <h3 className="text-lg font-semibold">Qualification Monitor & Payout Forecast</h3>
            <p className="text-sm text-muted-foreground mt-2">
                This section is under construction. It will provide tools to monitor agent progress and forecast annual payout obligations.
            </p>
        </section>

      </CardContent>
    </Card>
  );
}

// Basic DatePicker to satisfy dependency. A real app would have this built out.
const DatePickerWithPresets = ({ onSelect }: { onSelect: (date?: Date) => void }) => {
    const [date, setDate] = useState<Date>();
    
    useEffect(() => {
        onSelect(date);
    }, [date, onSelect]);

    return (
        <div>
            <Input type="date" onChange={e => setDate(e.target.valueAsDate ?? undefined)} />
        </div>
    );
};
