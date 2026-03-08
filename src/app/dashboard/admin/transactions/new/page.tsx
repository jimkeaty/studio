'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/firebase';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

const schema = z.object({
  agentId: z.string().min(1, 'Agent is required'),
  agentDisplayName: z.string().min(1, 'Agent name is required'),
  status: z.enum(['closed', 'pending', 'under_contract']),
  transactionType: z.enum([
    'residential_sale',
    'rental',
    'commercial_lease',
    'commercial_sale',
  ]),
  address: z.string().min(1, 'Address is required'),
  contractDate: z.string().optional().or(z.literal('')),
  closedDate: z.string().optional().or(z.literal('')),
  dealValue: z.coerce.number().min(0),
  commission: z.coerce.number().min(0).optional(),
  brokerProfit: z.coerce.number().min(0).optional(),
  clientName: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type AgentOption = {
  agentId: string;
  agentName: string;
};

const PageSkeleton = () => (
  <div className="space-y-6">
    <Skeleton className="h-10 w-64" />
    <Skeleton className="h-96 w-full" />
  </div>
);

export default function NewTransactionPage() {
  const { user, loading: userLoading } = useUser();
  const { toast } = useToast();

  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      agentId: '',
      agentDisplayName: '',
      status: 'pending',
      transactionType: 'residential_sale',
      address: '',
      contractDate: '',
      closedDate: '',
      dealValue: 0,
      commission: 0,
      brokerProfit: 0,
      clientName: '',
      notes: '',
    },
  });

  useEffect(() => {
    const loadAgents = async () => {
      if (!user) return;

      try {
        setAgentsLoading(true);
        setPageError(null);

        const token = await user.getIdToken();
        const res = await fetch('/api/admin/agents?year=2025', {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Failed to load agents');
        }

        setAgents(data.agents || []);
      } catch (err: any) {
        console.error(err);
        setPageError(err.message || 'Failed to load agents');
      } finally {
        setAgentsLoading(false);
      }
    };

    if (!userLoading && user && user.uid === ADMIN_UID) {
      loadAgents();
    } else if (!userLoading) {
      setAgentsLoading(false);
    }
  }, [user, userLoading]);

  async function onSubmit(values: FormValues) {
    if (!user) return;

    try {
      setSubmitting(true);
      setPageError(null);

      const token = await user.getIdToken();

      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...values,
          source: 'manual',
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to create transaction');
      }

      toast({
        title: 'Transaction created',
        description: `Transaction ${data.id} was added successfully.`,
      });

      form.reset({
        agentId: '',
        agentDisplayName: '',
        status: 'pending',
        transactionType: 'residential_sale',
        address: '',
        contractDate: '',
        closedDate: '',
        dealValue: 0,
        commission: 0,
        brokerProfit: 0,
        clientName: '',
        notes: '',
      });
    } catch (err: any) {
      console.error(err);
      setPageError(err.message || 'Failed to create transaction');

      toast({
        title: 'Could not create transaction',
        description: err.message || 'Please review the form and try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (userLoading) {
    return <PageSkeleton />;
  }

  if (!user) {
    return (
      <Alert>
        <AlertTitle>Authentication Required</AlertTitle>
        <AlertDescription>Please sign in to access this page.</AlertDescription>
      </Alert>
    );
  }

  if (user.uid !== ADMIN_UID) {
    return (
      <Alert>
        <AlertTitle>Access Denied</AlertTitle>
        <AlertDescription>This page is restricted to administrators.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Add Transaction</h1>
        <p className="text-muted-foreground">
          Create a manual transaction record in Smart Broker USA.
        </p>
      </div>

      {pageError && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card>
            <CardHeader>
              <CardTitle>Transaction Details</CardTitle>
              <CardDescription>
                This creates a new item-level transaction in Firestore.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="agentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Agent</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          const selected = agents.find((a) => a.agentId === value);
                          form.setValue('agentDisplayName', selected?.agentName || '');
                        }}
                        value={field.value}
                        disabled={agentsLoading}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={agentsLoading ? 'Loading agents...' : 'Select an agent'} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {agents.map((agent) => (
                            <SelectItem key={agent.agentId} value={agent.agentId}>
                              {agent.agentName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="under_contract">Under Contract</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="transactionType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Transaction Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select transaction type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="residential_sale">Residential Sale</SelectItem>
                        <SelectItem value="rental">Rental</SelectItem>
                        <SelectItem value="commercial_lease">Commercial Lease</SelectItem>
                        <SelectItem value="commercial_sale">Commercial Sale</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Property Address</FormLabel>
                    <FormControl>
                      <Input placeholder="123 Main St, Lafayette, LA" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField
                  control={form.control}
                  name="contractDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contract Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="closedDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Closed Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dealValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Deal Value</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField
                  control={form.control}
                  name="commission"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Commission</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="brokerProfit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Broker Profit</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="clientName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Optional" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Optional notes..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <input type="hidden" {...form.register('agentDisplayName')} />
            </CardContent>

            <CardFooter>
              <Button type="submit" disabled={submitting || agentsLoading}>
                <Save className="mr-2 h-4 w-4" />
                {submitting ? 'Saving...' : 'Create Transaction'}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}
