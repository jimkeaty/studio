
'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { LeaderboardConfig, LeaderboardAgentMetrics } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Crown, Rocket, Zap, AlertCircle, Loader2 } from 'lucide-react';
import React, { useState, useEffect, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { getLeaderboardRows } from '@/lib/rollupsService';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Mock data simulating the Firestore config document
const mockConfig: LeaderboardConfig = {
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

const getMetricLabel = (key: string) => key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());

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
                        <div className="flex-shrink-0 w-48 space-y-2">
                             <Skeleton className="h-10 w-full" />
                             <Skeleton className="h-4 w-2/3 ml-auto" />
                        </div>
                    </div>
                </CardContent>
            </Card>
        ))}
    </div>
);


export default function LeaderboardPage() {
  // Config is mocked for now, but data will be live.
  const config = mockConfig; 
  const db = useFirestore();

  const [agents, setAgents] = useState<LeaderboardAgentMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (!db) return;

    setLoading(true);
    const selectedYear = new Date().getFullYear(); // Or from a selector

    getLeaderboardRows(db, selectedYear)
      .then(data => {
        setAgents(data);
        setError(null);
      })
      .catch(err => {
        console.error("Failed to fetch leaderboard data:", err);
        setError("Could not load leaderboard data. Please try again later.");
      })
      .finally(() => setLoading(false));

  }, [db]);


  const sortedAgents = useMemo(() => {
    return agents.sort((a, b) => {
      const primaryDiff = (b.metrics[config.primaryMetricKey] || 0) - (a.metrics[config.primaryMetricKey] || 0);
      if (primaryDiff !== 0) return primaryDiff;
      if (config.secondaryMetricKey) {
        return (b.metrics[config.secondaryMetricKey] || 0) - (a.metrics[config.secondaryMetricKey] || 0);
      }
      return 0;
    }).slice(0, config.showTopN);
  }, [agents, config]);
  
  const leaderScore = sortedAgents.length > 0 ? sortedAgents[0].metrics[config.primaryMetricKey] : 0;

  return (
    <div className="dark min-h-screen bg-gray-900 text-white p-8 font-sans">
      <header className="text-center mb-12">
        <h1 className="text-6xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary to-orange-400">
          {config.title}
        </h1>
        <p className="text-2xl text-gray-400 mt-2">{config.subtitle}</p>
      </header>

      <main className="max-w-7xl mx-auto">
        {loading ? (
            <LeaderboardSkeleton />
        ) : error ? (
            <Alert variant="destructive" className="bg-red-900/50 border-red-700 text-red-300">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        ) : sortedAgents.length === 0 ? (
            <div className="text-center py-16">
                <Loader2 className="mx-auto h-12 w-12 text-gray-500 mb-4" />
                <h3 className="text-lg font-medium text-gray-400">Awaiting Data...</h3>
                <p className="text-sm text-gray-500">Leaderboard data for this period is not yet available.</p>
            </div>
        ) : (
            <div className="space-y-4">
            {sortedAgents.map((agent, index) => {
                const primaryValue = agent.metrics[config.primaryMetricKey];
                const progress = leaderScore > 0 ? (primaryValue / leaderScore) * 100 : 0;

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
                        <div className="flex items-baseline gap-3">
                            <div className="text-2xl font-bold">{agent.displayName}</div>
                            <div className="text-sm font-semibold text-primary">{agent.teamType}</div>
                            {agent.isCorrected && (
                                <TooltipProvider>
                                    <Tooltip>
                                    <TooltipTrigger>
                                        <Badge variant="outline" className="border-yellow-400 text-yellow-400">Corrected</Badge>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs bg-gray-800 text-white border-gray-600">
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
                        <div className="text-4xl font-black tabular-nums">{primaryValue}</div>
                        <div className="text-sm text-gray-400 font-medium">{getMetricLabel(config.primaryMetricKey)}</div>
                        {config.secondaryMetricKey && (
                            <div className="text-lg text-gray-500 font-semibold mt-1">
                            {agent.metrics[config.secondaryMetricKey]} {getMetricLabel(config.secondaryMetricKey)}
                            </div>
                        )}
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
         <p>Updating in real-time... | {config.periodId} Leaderboard</p>
      </footer>
    </div>
  );
}
