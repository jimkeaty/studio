'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { LeaderboardConfig, leaderboardMetrics, LeaderboardMetricKey, LeaderboardPeriod } from '@/lib/types';
import { Save, Tv, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEffect, useState } from 'react';

const leaderboardConfigSchema = z.object({
  year: z.coerce.number(),
  periodType: z.custom<LeaderboardPeriod>(),
  title: z.string().min(1, 'Title is required.'),
  subtitle: z.string().optional().default(''),
  primaryMetricKey: z.custom<LeaderboardMetricKey>(),
  showTopN: z.coerce.number().min(1).max(50),
  showGCI: z.boolean().default(true),
  showVolume: z.boolean().default(true),
  showSales: z.boolean().default(true),
});

type LeaderboardConfigFormValues = z.infer<typeof leaderboardConfigSchema>;

const DEFAULTS: LeaderboardConfigFormValues = {
  periodType: 'yearly',
  year: new Date().getFullYear(),
  title: 'Production Leaderboard',
  subtitle: '',
  primaryMetricKey: 'closed',
  showTopN: 10,
  showGCI: true,
  showVolume: true,
  showSales: true,
};

export default function LeaderboardAdminPage() {
  const { toast } = useToast();
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [saving, setSaving] = useState(false);

  const form = useForm<LeaderboardConfigFormValues>({
    resolver: zodResolver(leaderboardConfigSchema),
    defaultValues: DEFAULTS,
  });

  // ── Load config from Firestore on mount ──────────────────────────────────────
  useEffect(() => {
    setLoadingConfig(true);
    fetch('/api/board-config?board=leaderboard')
      .then((r) => r.json())
      .then((json) => {
        if (json.ok && json.config) {
          const cfg = json.config as LeaderboardConfig;
          form.reset({
            year: cfg.year ?? DEFAULTS.year,
            periodType: cfg.periodType ?? DEFAULTS.periodType,
            title: cfg.title ?? DEFAULTS.title,
            subtitle: cfg.subtitle ?? DEFAULTS.subtitle,
            primaryMetricKey: cfg.primaryMetricKey ?? DEFAULTS.primaryMetricKey,
            showTopN: cfg.showTopN ?? DEFAULTS.showTopN,
            showGCI: cfg.showGCI !== false,
            showVolume: cfg.showVolume !== false,
            showSales: cfg.showSales !== false,
          });
        }
      })
      .catch((err) => {
        console.error('Failed to load leaderboard config:', err);
        toast({ title: 'Error', description: 'Could not load saved config.', variant: 'destructive' });
      })
      .finally(() => setLoadingConfig(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Save config to Firestore ─────────────────────────────────────────────────
  async function onSubmit(data: LeaderboardConfigFormValues) {
    setSaving(true);
    try {
      const res = await fetch('/api/board-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board: 'leaderboard', config: data }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'Unknown error');
      toast({
        title: 'Leaderboard Config Saved',
        description: `Settings for ${data.year} have been updated. The TV display will reflect changes on next load.`,
      });
    } catch (err: any) {
      console.error('Failed to save leaderboard config:', err);
      toast({ title: 'Save Failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
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

      {loadingConfig ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading saved configuration…
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* ── Period & Year ────────────────────────────────────────────────────────────────── */}
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
                    name="periodType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Competition Period</FormLabel>
                        <FormControl>
                          <Tabs value={field.value} onValueChange={field.onChange} className="w-full">
                            <TabsList className="grid w-full grid-cols-3">
                              <TabsTrigger value="yearly">Year</TabsTrigger>
                              <TabsTrigger value="quarterly" disabled>Quarter</TabsTrigger>
                              <TabsTrigger value="monthly" disabled>Month</TabsTrigger>
                            </TabsList>
                          </Tabs>
                        </FormControl>
                        <FormDescription>
                          Quarterly/Monthly views require transaction-level data.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="year"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Year</FormLabel>
                        <Select
                          onValueChange={(v) => field.onChange(Number(v))}
                          value={String(field.value)}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select year" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {[...Array(5)].map((_, i) => {
                              const y = new Date().getFullYear() + 1 - i;
                              return (
                                <SelectItem key={y} value={String(y)}>
                                  {y}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
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
                        <Input placeholder="e.g., Annual Sales Sprint" {...field} />
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
                        <Select onValueChange={field.onChange} value={field.value}>
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
              </CardContent>
            </Card>

            {/* ── TV Display Toggles ───────────────────────────────────────────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle>TV Display Options</CardTitle>
                <CardDescription>
                  Control which columns and stats are visible on the public TV leaderboard.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <FormField
                  control={form.control}
                  name="showGCI"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Show GCI Column</FormLabel>
                        <FormDescription>
                          Display the Gross Commission Income column on the public leaderboard. Turn off to hide commission figures from public view.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="showVolume"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Show Closed Volume</FormLabel>
                        <FormDescription>
                          Display the total closed sales volume (in dollars) for each agent.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="showSales"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Show Closed Sales Count</FormLabel>
                        <FormDescription>
                          Display the number of closed transactions for each agent.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter>
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Configuration
                </Button>
              </CardFooter>
            </Card>
          </form>
        </Form>
      )}
    </div>
  );
}
