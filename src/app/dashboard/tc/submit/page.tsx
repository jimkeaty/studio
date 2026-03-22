'use client';

import { useState } from 'react';
import { useUser } from '@/firebase';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, AlertTriangle, Send, ClipboardList } from 'lucide-react';
import Link from 'next/link';

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────
const schema = z.object({
  // Basics
  closingType: z.enum(['buyer', 'listing', 'referral'], { required_error: 'Type of closing is required' }),
  dealType: z.enum(['residential_sale', 'residential_lease', 'land', 'commercial_sale', 'commercial_lease']),
  address: z.string().min(5, 'Full property address is required'),
  clientName: z.string().min(1, 'Client name is required'),
  dealSource: z.string().optional(),

  // Financial
  listPrice: z.coerce.number().min(0).optional().or(z.literal('')),
  salePrice: z.coerce.number().min(0).optional().or(z.literal('')),
  commissionPercent: z.coerce.number().min(0).max(100).optional().or(z.literal('')),
  gci: z.coerce.number().min(0).optional().or(z.literal('')),
  transactionFee: z.coerce.number().min(0).optional().or(z.literal('')),
  earnestMoney: z.coerce.number().min(0).optional().or(z.literal('')),
  brokerPct: z.coerce.number().min(0).max(100).optional().or(z.literal('')),
  brokerGci: z.coerce.number().min(0).optional().or(z.literal('')),
  agentPct: z.coerce.number().min(0).max(100).optional().or(z.literal('')),
  agentDollar: z.coerce.number().min(0).optional().or(z.literal('')),

  // Dates
  listingDate: z.string().optional().or(z.literal('')),
  contractDate: z.string().min(1, 'Under contract date is required'),
  optionExpiration: z.string().optional().or(z.literal('')),
  inspectionDeadline: z.string().optional().or(z.literal('')),
  surveyDeadline: z.string().optional().or(z.literal('')),
  projectedCloseDate: z.string().optional().or(z.literal('')),
  closedDate: z.string().optional().or(z.literal('')),

  // Parties
  mortgageCompany: z.string().optional(),
  loanOfficer: z.string().optional(),
  titleCompany: z.string().optional(),
  titleOfficer: z.string().optional(),
  otherAgentName: z.string().optional(),
  otherBrokerage: z.string().optional(),

  // Notes
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const SOURCES = [
  { value: 'boomtown', label: 'Boomtown' },
  { value: 'referral', label: 'Referral' },
  { value: 'sphere', label: 'Sphere of Influence' },
  { value: 'sign_call', label: 'Sign Call' },
  { value: 'company_gen', label: 'Company Generated' },
  { value: 'social', label: 'Social Media' },
  { value: 'open_house', label: 'Open House' },
  { value: 'fsbo', label: 'FSBO' },
  { value: 'expired_listing', label: 'Expired Listing' },
  { value: 'other', label: 'Other' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Section wrapper
// ─────────────────────────────────────────────────────────────────────────────
function Section({ title, description, children }: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-5">{children}</div>;
}

function Grid3({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-3 gap-5">{children}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function TcSubmitPage() {
  const { user, loading: userLoading } = useUser();
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [intakeId, setIntakeId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      closingType: 'buyer',
      dealType: 'residential_sale',
      address: '',
      clientName: '',
      dealSource: '',
      contractDate: '',
    },
  });

  if (userLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <Alert>
        <AlertTitle>Sign In Required</AlertTitle>
        <AlertDescription>Please sign in to submit a TC form.</AlertDescription>
      </Alert>
    );
  }

  if (user.uid === '1kJsXTU1JjZXMidmoIPXgXxizll1') {
    return (
      <Alert>
        <AlertTitle>Agents Only</AlertTitle>
        <AlertDescription>
          TC forms are submitted by agents. To review submitted forms, go to the{' '}
          <Link href="/dashboard/admin/tc" className="underline font-medium">TC Queue</Link>.
        </AlertDescription>
      </Alert>
    );
  }

  // ── Success screen ───────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="max-w-xl mx-auto text-center space-y-6 py-16">
        <CheckCircle2 className="h-20 w-20 text-green-500 mx-auto" />
        <h1 className="text-3xl font-bold">TC Form Submitted!</h1>
        <p className="text-muted-foreground">
          Your transaction has been submitted for review. The broker will review and approve it shortly.
          {intakeId && (
            <span className="block mt-2 font-mono text-xs text-muted-foreground">Ref: {intakeId}</span>
          )}
        </p>
        <div className="flex justify-center gap-3">
          <Button onClick={() => { setSubmitted(false); setIntakeId(null); form.reset(); }}>
            Submit Another
          </Button>
          <Link href="/dashboard">
            <Button variant="outline">Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  const onSubmit = async (values: FormValues) => {
    if (!user) return;
    setSubmitting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/tc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Submission failed');
      setIntakeId(data.id);
      setSubmitted(true);
      toast({ title: 'TC Form Submitted', description: 'Your transaction is pending broker review.' });
    } catch (err: any) {
      toast({ title: 'Submission Failed', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">TC Submission Form</h1>
          <p className="text-muted-foreground mt-1">
            Submit a new transaction for broker review and approval.
          </p>
        </div>
        <Badge variant="outline" className="mt-1">
          <ClipboardList className="h-3 w-3 mr-1" /> Draft
        </Badge>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

          {/* ── Section 1: Transaction Basics ─────────────────────────────── */}
          <Section title="Transaction Basics" description="What type of deal is this?">
            <Grid2>
              <FormField control={form.control} name="closingType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Type of Closing <span className="text-destructive">*</span></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="buyer">Buyer Representation</SelectItem>
                      <SelectItem value="listing">Listing / Seller Side</SelectItem>
                      <SelectItem value="referral">Referral</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="dealType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Deal / Property Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="residential_sale">Residential Sale</SelectItem>
                      <SelectItem value="residential_lease">Residential Lease</SelectItem>
                      <SelectItem value="land">Land</SelectItem>
                      <SelectItem value="commercial_sale">Commercial Sale</SelectItem>
                      <SelectItem value="commercial_lease">Commercial Lease</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </Grid2>

            <FormField control={form.control} name="address" render={({ field }) => (
              <FormItem>
                <FormLabel>Property Address <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Input placeholder="123 Main St, Lafayette, LA 70508" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <Grid2>
              <FormField control={form.control} name="clientName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Client Name <span className="text-destructive">*</span></FormLabel>
                  <FormControl><Input placeholder="Buyer or seller name" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="dealSource" render={({ field }) => (
                <FormItem>
                  <FormLabel>Lead Source</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Where did this lead come from?" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {SOURCES.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </Grid2>
          </Section>

          {/* ── Section 2: Key Dates ──────────────────────────────────────── */}
          <Section title="Key Dates" description="Enter all relevant dates for this transaction.">
            <Grid3>
              <FormField control={form.control} name="listingDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Listing Date</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="contractDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Under Contract Date <span className="text-destructive">*</span></FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="optionExpiration" render={({ field }) => (
                <FormItem>
                  <FormLabel>Option Period Expiration</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </Grid3>
            <Grid3>
              <FormField control={form.control} name="inspectionDeadline" render={({ field }) => (
                <FormItem>
                  <FormLabel>Inspection Deadline</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="surveyDeadline" render={({ field }) => (
                <FormItem>
                  <FormLabel>Survey Deadline</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="projectedCloseDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Projected Close Date</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </Grid3>
            <div className="max-w-xs">
              <FormField control={form.control} name="closedDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Actual Close Date</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormDescription>Leave blank if not yet closed.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </Section>

          {/* ── Section 3: Financial Details ──────────────────────────────── */}
          <Section title="Financial Details" description="Enter pricing and commission information.">
            <Grid2>
              <FormField control={form.control} name="listPrice" render={({ field }) => (
                <FormItem>
                  <FormLabel>List Price / Buyer Rep Price ($)</FormLabel>
                  <FormControl><Input type="number" step="1" placeholder="0" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="salePrice" render={({ field }) => (
                <FormItem>
                  <FormLabel>Sale Price ($)</FormLabel>
                  <FormControl><Input type="number" step="1" placeholder="0" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </Grid2>

            <Grid3>
              <FormField control={form.control} name="commissionPercent" render={({ field }) => (
                <FormItem>
                  <FormLabel>Commission %</FormLabel>
                  <FormControl><Input type="number" step="0.01" placeholder="3" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="gci" render={({ field }) => (
                <FormItem>
                  <FormLabel>GCI ($)</FormLabel>
                  <FormControl><Input type="number" step="0.01" placeholder="0" {...field} /></FormControl>
                  <FormDescription>Gross Commission Income</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="transactionFee" render={({ field }) => (
                <FormItem>
                  <FormLabel>Transaction Fee ($)</FormLabel>
                  <FormControl><Input type="number" step="0.01" placeholder="0" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </Grid3>

            <Separator />

            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Commission Split</p>
            <Grid2>
              <FormField control={form.control} name="brokerPct" render={({ field }) => (
                <FormItem>
                  <FormLabel>Broker %</FormLabel>
                  <FormControl><Input type="number" step="0.01" placeholder="30" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="brokerGci" render={({ field }) => (
                <FormItem>
                  <FormLabel>Broker GCI ($)</FormLabel>
                  <FormControl><Input type="number" step="0.01" placeholder="0" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="agentPct" render={({ field }) => (
                <FormItem>
                  <FormLabel>Agent % / % to Member</FormLabel>
                  <FormControl><Input type="number" step="0.01" placeholder="70" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="agentDollar" render={({ field }) => (
                <FormItem>
                  <FormLabel>Agent Net $ (Primary GCI)</FormLabel>
                  <FormControl><Input type="number" step="0.01" placeholder="0" {...field} /></FormControl>
                  <FormDescription>If filled, overrides split calculation on approval.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </Grid2>

            <div className="max-w-xs">
              <FormField control={form.control} name="earnestMoney" render={({ field }) => (
                <FormItem>
                  <FormLabel>Earnest Money ($)</FormLabel>
                  <FormControl><Input type="number" step="1" placeholder="0" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </Section>

          {/* ── Section 4: Parties ────────────────────────────────────────── */}
          <Section title="Transaction Parties" description="Lender, title company, and other agent info.">
            <Grid2>
              <FormField control={form.control} name="mortgageCompany" render={({ field }) => (
                <FormItem>
                  <FormLabel>Mortgage Company / Lender</FormLabel>
                  <FormControl><Input placeholder="First Federal Bank" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="loanOfficer" render={({ field }) => (
                <FormItem>
                  <FormLabel>Loan Officer Name</FormLabel>
                  <FormControl><Input placeholder="Optional" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="titleCompany" render={({ field }) => (
                <FormItem>
                  <FormLabel>Title Company</FormLabel>
                  <FormControl><Input placeholder="Acadian Title" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="titleOfficer" render={({ field }) => (
                <FormItem>
                  <FormLabel>Title Officer / Escrow Officer</FormLabel>
                  <FormControl><Input placeholder="Optional" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="otherAgentName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Other Agent Name</FormLabel>
                  <FormControl><Input placeholder="Cooperating agent (if any)" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="otherBrokerage" render={({ field }) => (
                <FormItem>
                  <FormLabel>Other Brokerage</FormLabel>
                  <FormControl><Input placeholder="Cooperating brokerage (if any)" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </Grid2>
          </Section>

          {/* ── Section 5: Notes ──────────────────────────────────────────── */}
          <Section title="Notes & Special Instructions" description="Anything the TC or broker should know about this deal.">
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Textarea
                    placeholder="Special conditions, contingencies, HOA info, key location, anything important..."
                    className="min-h-[120px]"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </Section>

          {/* Submit */}
          <div className="flex items-center gap-4 pb-8">
            <Button type="submit" size="lg" disabled={submitting}>
              <Send className="mr-2 h-4 w-4" />
              {submitting ? 'Submitting…' : 'Submit TC Form'}
            </Button>
            <p className="text-sm text-muted-foreground">
              This will go to the broker for review before being added to the ledger.
            </p>
          </div>
        </form>
      </Form>
    </div>
  );
}
