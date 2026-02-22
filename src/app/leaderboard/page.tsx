
'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { ProductionLeaderboardRow, LeaderboardPeriod } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Crown, Rocket, Zap, AlertCircle, Loader2, Trophy, BarChart, CalendarDays } from 'lucide-react';
import React, { useState, useEffect, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { getLeaderboardRows } from '@/lib/rollupsService';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const RaceIcon = ({ rank }: { rank: number }) => {
  if (rank === 0) return <Crown className="h-8 w-8 text-yellow-400" />;
  if (rank < 3) return <Rocket className="h-7 w-7 text-gray-400" />;
  return <Zap className="h-6 w-6 text-blue-500" />;
};

const LeaderboardSkeleton = () => (
    <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
            <Card key={i} className='bg-gray-800/50 border-2 border-gray-700'>
                <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                        <Skeleton className="h-8 w-12" />
                        <Skeleton className="h-16 w-16 rounded-full" />
                        <div className="flex-grow space-y-2">
                            <Skeleton className="h-6 w-1/3" />
                            <Skeleton className="h-6 w-full" />
                        </div>
                        <div className="flex-shrink-0 w-48 text-right">
                             <Skeleton className="h-10 w-24 ml-auto" />
                             <Skeleton className="h-4 w-32 ml-auto mt-2" />
                        </div>
                    </div>
                </CardContent>
            </Card>
        ))}
    </div>
);


export default function LeaderboardPage() {
  const db = useFirestore();
  const [rows, setRows] = useState<ProductionLeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [period, setPeriod] = useState<LeaderboardPeriod>('yearly');
  const [year, setYear] = useState(0);

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);
  
  useEffect(() => {
    if (!db || period !== 'yearly' || year === 0) {
        setRows([]);
        setLoading(false);
        return;
    };

    setLoading(true);

    getLeaderboardRows(db, year)
      .then(data => {
        setRows(data);
        setError(null);
      })
      .catch(err => {
        console.error("Failed to fetch leaderboard data:", err);
        setError("Could not load leaderboard data. Please try again later.");
      })
      .finally(() => setLoading(false));

  }, [db, period, year]);
  
  const leaderScore = rows.length > 0 ? rows[0].closed : 0;

  return (
    <div className="dark min-h-screen bg-gray-900 text-white p-4 sm:p-8 font-sans">
      <header className="text-center mb-8">
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary to-orange-400">
          Production Leaderboard
        </h1>
        <p className="text-lg sm:text-2xl text-gray-400 mt-2">Brokerage-wide Performance</p>
      </header>

      <Card className="max-w-5xl mx-auto bg-gray-800/30 border-gray-700 mb-8">
        <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Tabs value={period} onValueChange={(v) => setPeriod(v as LeaderboardPeriod)}>
                <TabsList>
                    <TabsTrigger value="yearly">Year</TabsTrigger>
                    <TabsTrigger value="quarterly">Quarter</TabsTrigger>
                    <TabsTrigger value="monthly">Month</TabsTrigger>
                </TabsList>
            </Tabs>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="w-full sm:w-[120px] bg-gray-800 border-gray-600">
                    <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                    {[...Array(5)].map((_, i) => {
                        const y = new Date().getFullYear() + 1 - i;
                        return <SelectItem key={y} value={String(y)}>{y}</SelectItem>;
                    })}
                </SelectContent>
            </Select>
        </CardContent>
      </Card>

      <main className="max-w-7xl mx-auto">
        {loading ? (
            <LeaderboardSkeleton />
        ) : error ? (
            <Alert variant="destructive" className="bg-red-900/50 border-red-700 text-red-300">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        ) : period !== 'yearly' ? (
             <div className="text-center py-16">
                <CalendarDays className="mx-auto h-12 w-12 text-gray-500 mb-4" />
                <h3 className="text-lg font-medium text-gray-400">Coming Soon</h3>
                <p className="text-sm text-gray-500">Quarterly and Monthly leaderboards will be available once transaction-level data is connected.</p>
            </div>
        ) : rows.length === 0 ? (
            <div className="text-center py-16">
                <BarChart className="mx-auto h-12 w-12 text-gray-500 mb-4" />
                <h3 className="text-lg font-medium text-gray-400">No Data Available</h3>
                <p className="text-sm text-gray-500">Leaderboard data for {year} is not yet available.</p>
            </div>
        ) : (
            <div className="space-y-4">
            {rows.map((agent, index) => {
                const progress = leaderScore > 0 ? (agent.closed / leaderScore) * 100 : 0;

                return (
                <Card
                    key={agent.agentId}
                    className={cn(
                    'bg-gray-800/50 border-2 transition-all duration-300 ease-out',
                    index === 0 && 'border-yellow-400 shadow-2xl shadow-yellow-500/20',
                    index === 1 && 'border-gray-500',
                    index === 2 && 'border-orange-700',
                    index > 2 && 'border-gray-700'
                    )}
                >
                    <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                        <div className="flex-shrink-0 text-3xl font-bold text-gray-500 w-12 text-center">{index + 1}</div>
                        
                        <Avatar className="h-16 w-16 border-2 border-gray-600">
                        <AvatarImage src={agent.avatarUrl} alt={agent.displayName} />
                        <AvatarFallback>{agent.displayName.charAt(0)}</AvatarFallback>
                        </Avatar>

                        <div className="flex-grow">
                        <div className="flex items-center gap-2">
                            <div className="text-2xl font-bold">{agent.displayName}</div>
                            {agent.isCorrected && (
                                <TooltipProvider>
                                    <Tooltip>
                                    <TooltipTrigger>
                                        <Badge variant="outline" className="border-yellow-400 text-yellow-400">Corrected</Badge>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs bg-gray-800 text-white border-gray-600">
                                        <p className="font-semibold">Reason for Correction:</p>
                                        <p>{agent.correctionReason}</p>
                                    </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            )}
                        </div>
                        <div className="mt-2 h-6 w-full bg-gray-700/50 rounded-full overflow-hidden border border-gray-600">
                            <div
                            className={cn(
                                "h-full rounded-full bg-gradient-to-r from-blue-500 to-primary transition-all duration-500 ease-out flex items-center justify-end pr-2",
                                index === 0 && "from-yellow-500 to-orange-400"
                            )}
                            style={{ width: `${progress}%` }}
                            >
                            <RaceIcon rank={index} />
                            </div>
                        </div>
                        </div>
                        
                        <div className="flex-shrink-0 text-right w-48">
                            <div className="text-4xl font-black tabular-nums">{agent.closed}</div>
                            <div className="text-sm text-gray-400 font-medium">Closed Units</div>
                            <div className="text-lg text-gray-500 font-semibold mt-1">
                                {agent.pending} Pending
                            </div>
                        </div>
                    </div>
                    </CardContent>
                </Card>
                );
            })}
            </div>
        )}
      </main>
      
       <footer className="text-center mt-12 text-gray-600">
         <p>Displaying {period} results for {year}</p>
      </footer>
    </div>
  );
}

    