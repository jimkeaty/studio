'use client';

/**
 * ManageImportBatches
 *
 * Lists all bulk appointment import batches grouped by the date they were
 * imported. Each row shows the import date/time, row count, and sample
 * client names. A "Delete Batch" button (with confirmation dialog) deletes
 * every appointment in that batch at once.
 */

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Loader2, Trash2, RefreshCw, PackageOpen, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImportBatch {
  importBatchId: string;
  importedAt: string; // ISO string
  count: number;
  sampleNames: string[];
}

interface ManageImportBatchesProps {
  viewAs?: string;
  onBatchDeleted?: (deletedCount: number) => void;
}

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}

export function ManageImportBatches({ viewAs, onBatchDeleted }: ManageImportBatchesProps) {
  const { user } = useUser();
  const { toast } = useToast();

  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadBatches = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      if (viewAs) params.set('viewAs', viewAs);
      const res = await fetch(`/api/appointments/bulk-batches?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load batches');
      setBatches(data.batches ?? []);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setLoading(false);
    }
  }, [user, viewAs, toast]);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  const handleDelete = async (batch: ImportBatch) => {
    if (!user) return;
    setDeletingId(batch.importBatchId);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({ batchId: batch.importBatchId });
      if (viewAs) params.set('viewAs', viewAs);
      const res = await fetch(`/api/appointments/bulk-batches?${params}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      toast({
        title: 'Batch Deleted',
        description: `${data.deleted} appointment${data.deleted !== 1 ? 's' : ''} removed.`,
      });
      setBatches(prev => prev.filter(b => b.importBatchId !== batch.importBatchId));
      onBatchDeleted?.(data.deleted);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Delete Failed', description: err.message });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Manage Import Batches
            </CardTitle>
            <CardDescription className="mt-1">
              Each row below is one bulk import. Delete an entire batch to remove all appointments from that upload.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadBatches} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Loading import history...</span>
          </div>
        ) : batches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
            <PackageOpen className="h-10 w-10 opacity-40" />
            <p className="font-medium">No bulk imports found</p>
            <p className="text-sm">Appointments imported via the Bulk Import tab will appear here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {batches.map(batch => (
              <div
                key={batch.importBatchId}
                className="flex items-center justify-between gap-4 rounded-lg border p-4 hover:bg-muted/30 transition-colors"
              >
                {/* Left — date + count + names */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">
                      {formatDateTime(batch.importedAt)}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {batch.count} appointment{batch.count !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                  {batch.sampleNames.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {batch.sampleNames.join(', ')}
                      {batch.count > batch.sampleNames.length && ` +${batch.count - batch.sampleNames.length} more`}
                    </p>
                  )}
                </div>

                {/* Right — delete button */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive border-destructive/30 hover:bg-destructive/10 shrink-0"
                      disabled={deletingId === batch.importBatchId}
                    >
                      {deletingId === batch.importBatchId ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      <span className="ml-2 hidden sm:inline">Delete Batch</span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this import batch?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete all <strong>{batch.count} appointment{batch.count !== 1 ? 's' : ''}</strong> imported on{' '}
                        <strong>{formatDateTime(batch.importedAt)}</strong>.
                        {batch.sampleNames.length > 0 && (
                          <span className="block mt-1 text-muted-foreground">
                            Includes: {batch.sampleNames.join(', ')}
                            {batch.count > batch.sampleNames.length && ` and ${batch.count - batch.sampleNames.length} more.`}
                          </span>
                        )}
                        <span className="block mt-2 font-semibold text-destructive">
                          This action cannot be undone.
                        </span>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(batch)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete {batch.count} Appointment{batch.count !== 1 ? 's' : ''}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
