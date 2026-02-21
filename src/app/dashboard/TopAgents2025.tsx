
"use client";

import { useEffect, useMemo, useState } from "react";
import { useFirestore } from "@/firebase";
import { getEffectiveRollups } from "@/lib/rollupsService";
import type { EffectiveRollup } from "@/lib/overrides";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function TopAgents2025({ year = 2025 }: { year?: number }) {
  const db = useFirestore();

  const [rows, setRows] = useState<EffectiveRollup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!db) return;

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");

        const data = await getEffectiveRollups(db, year);

        if (!cancelled) setRows(data);
      } catch (e: any) {
        console.error("Failed to fetch top agents data:", e);
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [db, year]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => (b?.totals?.all || 0) - (a?.totals?.all || 0));
  }, [rows]);

  const totals = useMemo(() => {
    return sorted.reduce(
      (acc, r) => {
        acc.closed += r.closed || 0;
        acc.pending += r.pending || 0;
        acc.total += r?.totals?.all || 0;
        return acc;
      },
      { closed: 0, pending: 0, total: 0 }
    );
  }, [sorted]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error Loading Top Agents</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
                <CardTitle>Top Agents ({year})</CardTitle>
                <CardDescription>
                    {year < 2025 ? `Historical data for ${year} with corrections.` : `Live data for ${year}.`}
                </CardDescription>
            </div>
            <div className="flex gap-4 text-right">
                <div>
                    <div className="text-xs text-muted-foreground">Total Closed</div>
                    <div className="text-lg font-bold">{totals.closed}</div>
                </div>
                <div>
                    <div className="text-xs text-muted-foreground">Total Pending</div>
                    <div className="text-lg font-bold">{totals.pending}</div>
                </div>
                <div>
                    <div className="text-xs text-muted-foreground">Total All</div>
                    <div className="text-lg font-bold">{totals.total}</div>
                </div>
            </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">Rank</TableHead>
                <TableHead>Agent ID</TableHead>
                <TableHead className="text-right">Closed</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Total Units</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    No agent rollup data found for {year}.
                  </TableCell>
                </TableRow>
              ) : (
                sorted.slice(0, 10).map((r, idx) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{idx + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code>{r.agentId}</code>
                        {r.isCorrected && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant="outline">Corrected</Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">{r.correctionReason}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{r.closed || 0}</TableCell>
                    <TableCell className="text-right">{r.pending || 0}</TableCell>
                    <TableCell className="text-right font-bold">{r?.totals?.all || 0}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground mt-4">
            Showing top {Math.min(10, sorted.length)} of {sorted.length} agents for {year}.
        </p>
      </CardContent>
    </Card>
  );
}
