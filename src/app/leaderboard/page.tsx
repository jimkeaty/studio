'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { LeaderboardConfig, LeaderboardRollup } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Crown, Rocket, Zap } from 'lucide-react';
import React from 'react';

// Mock data simulating the Firestore documents
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

const mockRollup: LeaderboardRollup = {
  periodId: '2026-Q1',
  startDate: '2026-01-01',
  endDate: '2026-03-31',
  agents: [
    { agentId: 'agent-1', displayName: 'Sonja D.', teamType: 'CGL', avatarUrl: 'https://i.pravatar.cc/150?u=agent-1', metrics: { calls: 1250, engagements: 420, apptsSet: 50, apptsHeld: 48, contracts: 15, closings: 10 } },
    { agentId: 'agent-3', displayName: 'Alicia R.', teamType: 'CGL', avatarUrl: 'https://i.pravatar.cc/150?u=agent-3', metrics: { calls: 1100, engagements: 380, apptsSet: 42, apptsHeld: 40, contracts: 10, closings: 7 } },
    { agentId: 'agent-2', displayName: 'Michael C.', teamType: 'SGL', avatarUrl: 'https://i.pravatar.cc/150?u=agent-2', metrics: { calls: 800, engagements: 250, apptsSet: 28, apptsHeld: 25, contracts: 5, closings: 3 } },
    { agentId: 'agent-4', displayName: 'David B.', teamType: 'SGL', avatarUrl: 'https://i.pravatar.cc/150?u=agent-4', metrics: { calls: 1300, engagements: 450, apptsSet: 55, apptsHeld: 49, contracts: 12, closings: 8 } },
    { agentId: 'agent-5', displayName: 'Emily W.', teamType: 'CGL', avatarUrl: 'https://i.pravatar.cc/150?u=agent-5', metrics: { calls: 950, engagements: 310, apptsSet: 35, apptsHeld: 32, contracts: 8, closings: 6 } },
    { agentId: 'agent-6', displayName: 'Chris G.', teamType: 'CGL', avatarUrl: 'https://i.pravatar.cc/150?u=agent-6', metrics: { calls: 1050, engagements: 360, apptsSet: 40, apptsHeld: 38, contracts: 9, closings: 5 } },
    { agentId: 'agent-7', displayName: 'Jessica P.', teamType: 'SGL', avatarUrl: 'https://i.pravatar.cc/150?u=agent-7', metrics: { calls: 1400, engagements: 500, apptsSet: 60, apptsHeld: 55, contracts: 20, closings: 15 } },
    { agentId: 'agent-8', displayName: 'Brian K.', teamType: 'SGL', avatarUrl: 'https://i.pravatar.cc/150?u=agent-8', metrics: { calls: 700, engagements: 200, apptsSet: 20, apptsHeld: 18, contracts: 4, closings: 2 } },
  ],
};

const getMetricLabel = (key: string) => key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());

const RaceIcon = ({ rank }: { rank: number }) => {
  if (rank === 0) return <Crown className="h-8 w-8 text-yellow-400" />;
  if (rank < 3) return <Rocket className="h-7 w-7 text-gray-400" />;
  return <Zap className="h-6 w-6 text-blue-500" />;
};


export default function LeaderboardPage() {
  const config = mockConfig;
  const data = mockRollup;

  const sortedAgents = React.useMemo(() => {
    return data.agents.sort((a, b) => {
      const primaryDiff = b.metrics[config.primaryMetricKey] - a.metrics[config.primaryMetricKey];
      if (primaryDiff !== 0) return primaryDiff;
      if (config.secondaryMetricKey) {
        return b.metrics[config.secondaryMetricKey] - a.metrics[config.secondaryMetricKey];
      }
      return 0;
    }).slice(0, config.showTopN);
  }, [data, config]);
  
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
      </main>

       <footer className="text-center mt-12 text-gray-600">
         <p>Updating in real-time... | {config.periodId} Leaderboard</p>
      </footer>
    </div>
  );
}
