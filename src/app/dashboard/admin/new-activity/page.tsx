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
import { NewActivityConfig } from '@/lib/types';
import { Save, Tv } from 'lucide-react';
import Link from 'next/link';
import { Switch } from '@/components/ui/switch';

const newActivityConfigSchema = z.object({
  title: z.string().min(1, 'Title is required.'),
  lookbackDays: z.coerce.number().min(1),
  showTopN: z.coerce.number().min(1).max(50),
  showAddress: z.boolean(),
});

type NewActivityConfigFormValues = z.infer<typeof newActivityConfigSchema>;

// Mock data simulating the current config from Firestore
const currentConfig: NewActivityConfig = {
  lookbackDays: 60,
  showTopN: 25,
  sortOrder: 'newestFirst',
  title: 'New Activity (Last 60 Days)',
  showAddress: true,
};

export default function NewActivityAdminPage() {
  const { toast } = useToast();

  const form = useForm<NewActivityConfigFormValues>({
    resolver: zodResolver(newActivityConfigSchema),
    defaultValues: {
      title: currentConfig.title,
      lookbackDays: currentConfig.lookbackDays,
      showTopN: currentConfig.showTopN,
      showAddress: currentConfig.showAddress,
    },
  });

  function onSubmit(data: NewActivityConfigFormValues) {
    // In a real app, this would be a server action that updates the config doc in Firestore
    console.log('// TODO: Call server action to save new activity config:', data);
    toast({
      title: 'Activity Board Config Saved!',
      description: `The configuration for the activity board has been updated.`,
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Activity Board Configuration</h1>
          <p className="text-muted-foreground">Manage the public TV Mode board for new listings and contracts.</p>
        </div>
        <Link href="/new-activity" target="_blank">
          <Button variant="outline">
            <Tv className="mr-2 h-4 w-4" />
            View Activity Board
          </Button>
        </Link>
      </div>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card>
            <CardHeader>
              <CardTitle>Display Settings</CardTitle>
              <CardDescription>
                These settings control what is currently displayed on the public new activity board.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Board Title</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., New Activity" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="lookbackDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lookback Period</FormLabel>
                      <Select onValueChange={(value) => field.onChange(Number(value))} defaultValue={String(field.value)}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select lookback period" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="30">Last 30 Days</SelectItem>
                          <SelectItem value="60">Last 60 Days</SelectItem>
                          <SelectItem value="90">Last 90 Days</SelectItem>
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
                      <FormLabel>Number of Items to Show</FormLabel>
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
                name="showAddress"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Show Property Address</FormLabel>
                      <FormDescription>
                        Display the property address on the board.
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
