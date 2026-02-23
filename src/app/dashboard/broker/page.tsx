

'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DollarSign, Users, TrendingUp, Target, AlertCircle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, ChartConfig } from '@/components/ui/chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AgentDashboardData, User } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Scoreboard } from '@/components/dashboard/broker/scoreboard';
import { useFirestore } from '@/firebase';
import { getEffectiveRollups } from '@/lib/rollupsService';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { EffectiveRollup } from '@/lib/overrides';
import { RecruitingAdminConsole } from '@/components/dashboard/broker/RecruitingAdminConsole';


const monthlyBrokerGciData = {
  year: 2024,
  months: [
    { month: 'Jan', closedBrokerGci: 10000, pendingBrokerGci: 5000, brokerGciGoal: 60000 },
    { month: 'Feb', closedBrokerGci: 13000, pendingBrokerGci: 2000, brokerGciGoal: 60000 },
    { month: 'Mar', closedBrokerGci: 9000,  pendingBrokerGci: 8000, brokerGciGoal: 60000 },
    { month: 'Apr', closedBrokerGci: 16000, pendingBrokerGci: 4000, brokerGciGoal: 60000 },
    { month: 'May', closedBrokerGci: 14400, pendingBrokerGci: 6000, brokerGciGoal: 60000 },
    { month: 'Jun', closedBrokerGci: 19000, pendingBrokerGci: 10000, brokerGciGoal: 60000 },
    { month: 'Jul', closedBrokerGci: 0, pendingBrokerGci: 8000, brokerGciGoal: 60000 },
    { month: 'Aug', closedBrokerGci: 0, pendingBrokerGci: 5000, brokerGciGoal: 60000 },
    { month: 'Sep', closedBrokerGci: 0, pendingBrokerGci: 0, brokerGciGoal: 60000 },
    { month: 'Oct', closedBrokerGci: 0, pendingBrokerGci: 0, brokerGciGoal: 60000 },
    { month: 'Nov', closedBrokerGci: 0, pendingBrokerGci: 0, brokerGciGoal: 60000 },
    { month: 'Dec', closedBrokerGci: 0, pendingBrokerGci: 0, brokerGciGoal: 60000 },
  ],
};

const chartConfig = {
    closedBrokerGci: { label: 'Net (Closed)', color: 'hsl(var(--primary))' },
    pendingBrokerGci: { label: 'Net (Pending)', color: 'hsl(var(--chart-2))' },
    brokerGciGoal: { label: 'Net Goal', color: 'hsl(var(--chart-3))' },
} satisfies ChartConfig;


const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);

const BrokerDashboardSkeleton = () => (
    <div className="space-y-8">
        <Skeleton className="h-12 w-1/2" />
        <Card><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
            <Card><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
            <Card><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
            <Card><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
        </div>
        <Card><CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
        <Card><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
    </div>
);

export default function BrokerDashboardPage() {
    const [selectedYear, setSelectedYear] = useState('');
    const db = useFirestore();
    const [rollups, setRollups] = useState<EffectiveRollup[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setSelectedYear(String(new Date().getFullYear()));
    }, []);

    useEffect(() => {
        if (!db || !selectedYear) return;

        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await getEffectiveRollups(db, parseInt(selectedYear, 10));
                if (!cancelled) {
                    setRollups(data);
                }
            } catch (e: any) {
                console.error("Failed to fetch broker data:", e);
                if (!cancelled) {
                    setError(e.message || "Failed to fetch brokerage data.");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })();

        return () => { cancelled = true; };
    }, [db, selectedYear]);

    const { totalNetEarned, totalNetPending, totalClosings, totalContractsWritten } = useMemo(() => {
        // NOTE: This is a simplified calculation. 'netEarned' and 'netPending' are not
        // part of the rollup data. For this example, we'll derive a simplified version.
        // A real implementation would need to join with agent-specific financial data.
        const AVG_COMMISSION = 3000;
        
        return rollups.reduce((acc, rollup) => {
            acc.totalClosings += rollup.closed || 0;
            acc.totalContractsWritten += (rollup.closed || 0) + (rollup.pending || 0); // Approximation
            acc.totalNetEarned += (rollup.closed || 0) * AVG_COMMISSION;
            acc.totalNetPending += (rollup.pending || 0) * AVG_COMMISSION;
            return acc;
        }, { totalNetEarned: 0, totalNetPending: 0, totalClosings: 0, totalContractsWritten: 0 });

    }, [rollups]);
    
    const funnelData = useMemo(() => [
        // This is a simplified funnel. A real one would need more data points.
        { name: 'Contracts', value: totalContractsWritten, fill: 'var(--color-chart-2)' },
        { name: 'Closings', value: totalClosings, fill: 'var(--color-primary)' },
    ], [totalContractsWritten, totalClosings]);

    if (!selectedYear) {
        return <BrokerDashboardSkeleton />;
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Broker Command</h1>
                <p className="text-muted-foreground">Aggregated view of your brokerage&apos;s performance for {selectedYear}.</p>
            </div>
            
            <Scoreboard />
            
             {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <Card><CardHeader><Skeleton className="h-6 w-3/4" /></CardHeader><CardContent><Skeleton className="h-8 w-1/2" /></CardContent></Card>
                    <Card><CardHeader><Skeleton className="h-6 w-3/4" /></CardHeader><CardContent><Skeleton className="h-8 w-1/2" /></CardContent></Card>
                    <Card><CardHeader><Skeleton className="h-6 w-3/4" /></CardHeader><CardContent><Skeleton className="h-8 w-1/2" /></CardContent></Card>
                    <Card><CardHeader><Skeleton className="h-6 w-3/4" /></CardHeader><CardContent><Skeleton className="h-8 w-1/2" /></CardContent></Card>
                </div>
            ) : error ? (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Total Net Earned (Est.)</CardTitle>
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{formatCurrency(totalNetEarned)}</div>
                            <p className="text-xs text-muted-foreground">Est. from all closed transactions.</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Total Net Pending (Est.)</CardTitle>
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{formatCurrency(totalNetPending)}</div>
                            <p className="text-xs text-muted-foreground">Est. from all pending deals.</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Total Closings</CardTitle>
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{totalClosings}</div>
                            <p className="text-xs text-muted-foreground">Total units closed this year.</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Active Agents</CardTitle>
                            <Users className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{rollups.length}</div>
                            <p className="text-xs text-muted-foreground">Number of agents with activity.</p>
                        </CardContent>
                    </Card>
                </div>
            )}
            
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Monthly Broker Net Income (Sample Data)</CardTitle>
                            <CardDescription>
                                Broker net income breakdown for {selectedYear}. This chart uses sample data.
                            </CardDescription>
                        </div>
                        <Select value={selectedYear} onValueChange={setSelectedYear}>
                            <SelectTrigger className="w-[120px]">
                                <SelectValue placeholder="Select year" />
                            </SelectTrigger>
                            <SelectContent>
                                {[...Array(5)].map((_, i) => {
                                    const year = new Date().getFullYear() - i;
                                    return <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                                })}
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    <ChartContainer
                        config={chartConfig}
                        className="h-[350px] w-full"
                    >
                        <BarChart data={monthlyBrokerGciData.months} margin={{ right: 5 }}>
                            <CartesianGrid vertical={false} />
                            <XAxis
                                dataKey="month"
                                tickLine={false}
                                axisLine={false}
                                tickMargin={8}
                            />
                            <YAxis
                                tickFormatter={(value) => `$${Number(value) / 1000}k`}
                            />
                            <ChartTooltip
                                cursor={true}
                                content={<ChartTooltipContent indicator="dot" />}
                            />
                            <ChartLegend content={<ChartLegendContent />} />
                            <Bar
                                dataKey="closedBrokerGci"
                                stackId="gci"
                                fill="var(--color-closedBrokerGci)"
                                radius={[0, 0, 0, 0]}
                            />
                            <Bar
                                dataKey="pendingBrokerGci"
                                stackId="gci"
                                fill="var(--color-pendingBrokerGci)"
                                radius={[4, 4, 0, 0]}
                            />
                            <Line
                                type="monotone"
                                dataKey="brokerGciGoal"
                                stroke="var(--color-brokerGciGoal)"
                                strokeWidth={2}
                                dot={false}
                                strokeDasharray="3 4"
                            />
                        </BarChart>
                    </ChartContainer>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Target /> Sales Funnel</CardTitle>
                        <CardDescription>Contract to closing overview for the brokerage.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={{}} className="h-[250px] w-full">
                            <BarChart data={funnelData} layout="vertical" margin={{ left: 10, right: 20 }}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={80} />
                                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
                                <Bar dataKey="value" radius={5} layout="vertical">
                                     {funnelData.map((entry, index) => (
                                        <div key={`cell-${index}`} style={{ backgroundColor: entry.fill }} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
                {/* Additional chart or component can go here */}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Agent Leaderboard</CardTitle>
                    <CardDescription>Top performing agents in your brokerage based on Closed Units YTD.</CardDescription>
                </CardHeader>
                <CardContent>
                     {loading ? (
                        <div className="space-y-4">
                            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Agent</TableHead>
                                    <TableHead className="text-right">Closed</TableHead>
                                    <TableHead className="text-right">Pending</TableHead>
                                    <TableHead className="text-right">Listings</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rollups.sort((a,b) => (b.closed || 0) - (a.closed || 0)).map((rollup) => (
                                    <TableRow key={rollup.id}>
                                        <TableCell>
                                            <div className="font-medium">{rollup.agentId}</div>
                                        </TableCell>
                                        <TableCell className="text-right">{rollup.closed || 0}</TableCell>
                                        <TableCell className="text-right">{rollup.pending || 0}</TableCell>
                                        <TableCell className="text-right">{rollup.listings.active || 0}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <RecruitingAdminConsole />
        </div>
    );
}
