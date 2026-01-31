'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { LeaderboardConfig, leaderboardMetrics, LeaderboardMetricKey } from '@/lib/types';
import { Save, Tv } from 'lucide-react';
import Link from 'next/link';
import { Textarea } from '@/components/ui/textarea';

const leaderboardConfigSchema = z.object({
  periodId: z.string().min(1, 'Period ID is required.'),
  title: z.string().min(1, 'Title is required.'),
  subtitle: z.string(),
  primaryMetricKey: z.custom<LeaderboardMetricKey>(),
  secondaryMetricKey: z.custom<LeaderboardMetricKey>().optional(),
  showTopN: z.coerce.number().min(1).max(50),
});

type LeaderboardConfigFormValues = z.infer<typeof leaderboardConfigSchema>;

// Mock data simulating the current config from Firestore
const currentConfig: LeaderboardConfig = {
  periodId: '2026-Q1',
  periodType: 'quarterly',
  title: 'Q1 Production Derby',
  subtitle: 'Appointments Held + Engagements',
  primaryMetricKey: 'apptsHeld',
  secondaryMetricKey: 'engagements',
  showTopN: 10,
  sortBy: 'primaryThenSecondary',
  visualMode: 'raceTrack',
};

export default function LeaderboardAdminPage() {
  const { toast } = useToast();

  const form = useForm<LeaderboardConfigFormValues>({
    resolver: zodResolver(leaderboardConfigSchema),
    defaultValues: {
      periodId: currentConfig.periodId,
      title: currentConfig.title,
      subtitle: currentConfig.subtitle,
      primaryMetricKey: currentConfig.primaryMetricKey,
      secondaryMetricKey: currentConfig.secondaryMetricKey,
      showTopN: currentConfig.showTopN,
    },
  });

  function onSubmit(data: LeaderboardConfigFormValues) {
    // In a real app, this would be a server action that updates the config doc in Firestore
    console.log('// TODO: Call server action to save leaderboard config:', data);
    toast({
      title: 'Leaderboard Config Saved!',
      description: `The configuration for ${data.periodId} has been updated.`,
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
            <h1 className="text-3xl font-bold tracking-tight">Leaderboard Configuration</h1>
            <p className="text-muted-foreground">Manage the public TV Mode leaderboard settings.</p>
        </div>
        <Link href="/leaderboard" target="_blank">
            <Button variant="outline">
                <Tv className="mr-2 h-4 w-4" />
                View TV Mode
            </Button>
        </Link>
      </div>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card>
            <CardHeader>
              <CardTitle>Active Period Settings</CardTitle>
              <CardDescription>
                These settings control what is currently displayed on the public leaderboard.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <FormField
                    control={form.control}
                    name="periodId"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Period ID</FormLabel>
                        <FormControl>
                            <Input placeholder="e.g., 2026-Q2 or 2026-07" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                <FormField
                    control={form.control}
                    name="showTopN"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Number of Agents to Show</FormLabel>
                        <FormControl>
                            <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                 />
              </div>

               <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Leaderboard Title</FormLabel>
                    <FormControl>
                        <Input placeholder="e.g., Q2 Sales Sprint" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                 <FormField
                control={form.control}
                name="subtitle"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Subtitle</FormLabel>
                    <FormControl>
                        <Textarea placeholder="Describe the focus of the leaderboard" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="primaryMetricKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Primary Metric (for Ranking)</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select primary metric" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {leaderboardMetrics.map((metric) => (
                            <SelectItem key={metric.key} value={metric.key}>
                              {metric.label}
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
                  name="secondaryMetricKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Secondary Metric (for Tie-Breaking)</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select secondary metric" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {leaderboardMetrics.map((metric) => (
                            <SelectItem key={metric.key} value={metric.key}>
                              {metric.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
            <CardFooter>
                <Button type="submit">
                    <Save className="mr-2 h-4 w-4" />
                    Save Configuration
                </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}
