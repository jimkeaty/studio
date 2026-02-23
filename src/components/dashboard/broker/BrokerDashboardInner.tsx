'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DollarSign, Users, TrendingUp, Target, AlertCircle, Home, Building as BuildingIcon, FileText } from 'lucide-react';
import { BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, LabelList } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, ChartConfig } from '@/components/ui/chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { BrokerCommandMetrics, Period } from '@/lib/types/brokerCommandMetrics';
// import { RecruitingAdminConsole } from '@/components/dashboard/broker/RecruitingAdminConsole';
import { format } from 'date-fns';

const formatCurrency = (amount: number | null | undefined, compact = false) => {
    if (amount === null || amount === undefined) return "—";
    const options: Intl.NumberFormatOptions = { style: 'currency', currency: 'USD' };
    if (compact) {
        if (Math.abs(amount) >= 1e6) return `$${(amount / 1e6).toFixed(1)}M`;
        if (Math.abs(amount) >= 1e3) return `$${(amount / 1e3).toFixed(0)}k`;
    }
    options.minimumFractionDigits = 0;
    options.maximumFractionDigits = 0;
    return new Intl.NumberFormat('en-US', options).format(amount);
};
const formatNumber = (num: number | null | undefined) => num?.toLocaleString() ?? '—';

const chartConfig = {
    closed: { label: "Closed", color: "hsl(var(--chart-1))" },
    pending: { label: "Pending", color: "hsl(var(--chart-2))" },
    goal: { label: "Goal", color: "hsl(var(--chart-3))" },
    current: { label: "This Period", color: "hsl(var(--chart-1))" },
    previous: { label: "Last Period", color: "hsl(var(--chart-4))" },
    activeAgents: { label: "Active Agents", color: "hsl(var(--chart-5))" },
    dealsPerAgent: { label: "Deals per Agent", color: "hsl(var(--chart-2))" }
} satisfies ChartConfig;

const BrokerDashboardSkeleton = () => (
    <div className="space-y-8">
        <Skeleton className="h-12 w-1/2" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => <Card key={i}><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>)}
        </div>
        <Card><CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
        <Card><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
    </div>
);

const CategoryBreakdownCard = ({ title, icon: Icon, closed, pending }: { title: string, icon: React.ElementType, closed: any, pending: any }) => (
    <Card>
        <CardHeader className="pb-2">
            <CardTitle className="text-lg font-medium flex items-center gap-2"><Icon className="h-5 w-5" />{title}</CardTitle>
        </CardHeader>
        <CardContent>
            <div className="space-y-1">
                <p className="font-semibold">Closed</p>
                <div className="flex justify-between text-sm"><span>Count:</span> <span>{formatNumber(closed.count)}</span></div>
                <div className="flex justify-between text-sm"><span>Net Revenue:</span> <span>{formatCurrency(closed.netRevenue)}</span></div>
            </div>
             <div className="space-y-1 mt-4">
                <p className="font-semibold">Pending</p>
                <div className="flex justify-between text-sm"><span>Count:</span> <span>{formatNumber(pending.count)}</span></div>
                <div className="flex justify-between text-sm"><span>Net Revenue:</span> <span>{formatCurrency(pending.netRevenue)}</span></div>
            </div>
        </CardContent>
    </Card>
);

export function BrokerDashboardInner() {
    const { user } = useUser();
    const [periodType, setPeriodType] = useState<Period['type']>('year');
    const [year, setYear] = useState<number>(new Date().getFullYear());
    const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
    const [data, setData] = useState<BrokerCommandMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    useEffect(() => {
        if (process.env.NODE_ENV === 'development') {
            console.log("Broker Command running in API-only mode (no client Firestore reads).");
        }

        if (!user) return; // Wait for user to be available

        setLoading(true);
        setError(null);
        
        const fetchData = async () => {
            try {
                const token = await user.getIdToken(true);
                const params = new URLSearchParams({
                    type: periodType,
                    year: String(year),
                });
                if (periodType === 'month') {
                    params.append('month', String(month));
                }

                const url = `/api/broker/command-metrics?${params.toString()}`;

                if (process.env.NODE_ENV === 'development') {
                    console.log("[BrokerDashboardInner] Preparing to fetch API:", {
                        uid: user.uid,
                        token_type: typeof token,
                        token_length: token.length,
                        token_prefix: token.slice(0, 20) + "...",
                        url: url
                    });
                }

                const response = await fetch(url, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `Request failed with status ${response.status}`);
                }

                const metrics: BrokerCommandMetrics = await response.json();
                setData(metrics);
            } catch (e: any) {
                 console.error("[BrokerCommand] Failed to fetch broker metrics:", e);
                if (e.message?.includes('Forbidden') || e.message?.includes('permission-denied') ) {
                    setError("You do not have sufficient permissions to view broker command data.");
                } else if (e.message?.includes('Invalid token')) {
                    setError(`Authorization Error: ${e.message}. Please try signing out and back in.`);
                }
                else {
                    setError(e.message || "An error occurred while fetching dashboard data.");
                }
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [user, periodType, year, month]);

    const { current, comparison } = useMemo(() => ({
        current: data?.currentPeriodMetrics,
        comparison: data?.comparisonPeriodMetrics,
    }), [data]);

    const forecast = (current?.netRevenue.closed ?? 0) + (current?.netRevenue.pending ?? 0);
    const goal = current?.netRevenue.goal;
    const gradeNow = goal && goal > 0 ? ((current?.netRevenue.closed ?? 0) / goal) * 100 : null;
    const gradePipeline = goal && goal > 0 ? (forecast / goal) * 100 : null;

    const mainChartData = (year !== null && month !== null && current) ? [{
        name: periodType === 'year' ? String(year) : format(new Date(year, month-1), 'MMM yyyy'),
        closed: current.netRevenue.closed ?? 0,
        pending: current.netRevenue.pending ?? 0,
        goal: current.netRevenue.goal,
    }] : [];
    
    const yoyChartData = (periodType === 'month' && current && comparison) ? [{
        name: 'Net Revenue',
        current: current.netRevenue.closed,
        previous: comparison.netRevenue.closed,
    }] : [];

    if (loading) {
        return <BrokerDashboardSkeleton />;
    }
    
    if (error) {
        return (
            <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        );
    }

    if (!data || !current) {
        return <BrokerDashboardSkeleton />;
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Broker Command Center</h1>
                    <p className="text-muted-foreground">Aggregated view of your brokerage&apos;s performance.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Tabs value={periodType} onValueChange={(v) => setPeriodType(v as Period['type'])} className="w-auto">
                        <TabsList><TabsTrigger value="year">Year</TabsTrigger><TabsTrigger value="month">Month</TabsTrigger></TabsList>
                    </Tabs>
                    <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                        <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{[...Array(5)].map((_, i) => { const y = new Date().getFullYear() - i; return <SelectItem key={y} value={String(y)}>{y}</SelectItem>})}</SelectContent>
                    </Select>
                    {periodType === 'month' && (
                        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                            <SelectContent>{[...Array(12)].map((_, i) => <SelectItem key={i+1} value={String(i+1)}>{format(new Date(2000, i), 'MMMM')}</SelectItem>)}</SelectContent>
                        </Select>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Actual Net Revenue</CardTitle><DollarSign className="h-4 w-4 text-muted-foreground absolute top-6 right-6" /></CardHeader><CardContent><div className="text-2xl font-bold">{formatCurrency(current.netRevenue.closed)}</div><p className="text-xs text-muted-foreground">From {current.transactions.closed} closings</p></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Pending Net Revenue</CardTitle><DollarSign className="h-4 w-4 text-muted-foreground absolute top-6 right-6" /></CardHeader><CardContent><div className="text-2xl font-bold">{formatCurrency(current.netRevenue.pending)}</div><p className="text-xs text-muted-foreground">From {current.transactions.pending} pending deals</p></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Forecast Net Revenue</CardTitle><Target className="h-4 w-4 text-muted-foreground absolute top-6 right-6" /></CardHeader><CardContent><div className="text-2xl font-bold text-primary">{formatCurrency(forecast)}</div><p className="text-xs text-muted-foreground">Closed + Pending</p></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Grade (vs Goal)</CardTitle><TrendingUp className="h-4 w-4 text-muted-foreground absolute top-6 right-6" /></CardHeader><CardContent><div className="text-2xl font-bold">{gradeNow ? `${gradeNow.toFixed(0)}%` : '—'}</div><p className="text-xs text-muted-foreground">{gradePipeline ? `Pipeline: ${gradePipeline.toFixed(0)}%` : 'Goal not set'}</p></CardContent></Card>
            </div>
            
            <Card>
                <CardHeader>
                    <CardTitle>Net Revenue</CardTitle>
                    <CardDescription>
                        {periodType === 'month' ? `Metrics for ${format(new Date(year, month - 1), 'MMMM yyyy')}` : `Metrics for ${year}`}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ChartContainer config={chartConfig} className="h-[120px] w-full">
                        <BarChart data={mainChartData} layout="vertical" margin={{ left: 20 }}>
                            <CartesianGrid horizontal={false} />
                            <YAxis type="category" dataKey="name" hide />
                            <XAxis type="number" tickFormatter={(val) => formatCurrency(val, true)} />
                            <ChartTooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltipContent />} />
                            <Bar dataKey="closed" stackId="a" fill="var(--color-closed)" radius={[4, 0, 0, 4]}>
                                <LabelList dataKey="closed" position="insideLeft" offset={8} className="fill-white font-semibold" formatter={(val: number) => formatCurrency(val, true)} />
                            </Bar>
                            <Bar dataKey="pending" stackId="a" fill="var(--color-pending)" radius={[0, 4, 4, 0]}>
                                <LabelList dataKey="pending" position="right" offset={8} className="fill-foreground font-semibold" formatter={(val: number) => val > 0 ? `+${formatCurrency(val, true)}` : ''} />
                            </Bar>
                             {goal && <Line dataKey="goal" stroke="var(--color-goal)" strokeWidth={2} dot={false} strokeDasharray="3 4" />}
                        </BarChart>
                    </ChartContainer>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {periodType === 'month' && yoyChartData.length > 0 && comparison && (
                     <Card>
                        <CardHeader><CardTitle>YoY Monthly Net Revenue</CardTitle><CardDescription>Closed net revenue this month vs. same month last year.</CardDescription></CardHeader>
                        <CardContent>
                            <ChartContainer config={chartConfig} className="h-[250px] w-full">
                                <BarChart data={yoyChartData} >
                                    <CartesianGrid vertical={false} />
                                    <XAxis dataKey="name" tickLine={false} axisLine={false} />
                                    <YAxis tickFormatter={(val) => formatCurrency(val, true)} />
                                    <ChartTooltip content={<ChartTooltipContent />} />
                                    <ChartLegend content={<ChartLegendContent />} />
                                    <Bar dataKey="previous" fill="var(--color-previous)" radius={4}>
                                        <LabelList position="top" formatter={(val: number) => formatCurrency(val, true)} />
                                    </Bar>
                                    <Bar dataKey="current" fill="var(--color-current)" radius={4}>
                                        <LabelList position="top" formatter={(val: number) => formatCurrency(val, true)} />
                                    </Bar>
                                </BarChart>
                            </ChartContainer>
                        </CardContent>
                    </Card>
                )}
                <Card>
                     <CardHeader><CardTitle>Monthly Agent Productivity</CardTitle><CardDescription>Deals per active agent over the last 12 months.</CardDescription></CardHeader>
                     <CardContent>
                         <ChartContainer config={chartConfig} className="h-[250px] w-full">
                             <BarChart data={data.monthlyTrend}>
                                 <CartesianGrid vertical={false} />
                                 <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                                 <YAxis yAxisId="left" orientation="left" stroke="var(--color-activeAgents)" tickFormatter={formatNumber} />
                                 <YAxis yAxisId="right" orientation="right" stroke="var(--color-dealsPerAgent)" tickFormatter={(val) => val.toFixed(1)} />
                                 <ChartTooltip content={<ChartTooltipContent />} />
                                 <ChartLegend content={<ChartLegendContent />} />
                                 <Bar yAxisId="left" dataKey="activeAgents" fill="var(--color-activeAgents)" name="Active Agents" radius={4} />
                                 <Line yAxisId="right" dataKey="dealsPerAgent" type="monotone" stroke="var(--color-dealsPerAgent)" name="Deals per Agent" strokeWidth={2} dot={false} />
                             </BarChart>
                         </ChartContainer>
                     </CardContent>
                 </Card>
            </div>
            
            <div>
                 <h2 className="text-2xl font-bold tracking-tight mb-4">Category Breakdown</h2>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <CategoryBreakdownCard title="Residential Sale" icon={Home} closed={current.categoryBreakdown.closed.residential_sale} pending={current.categoryBreakdown.pending.residential_sale} />
                    <CategoryBreakdownCard title="Rental" icon={BuildingIcon} closed={current.categoryBreakdown.closed.rental} pending={current.categoryBreakdown.pending.rental} />
                    <CategoryBreakdownCard title="Commercial Lease" icon={FileText} closed={current.categoryBreakdown.closed.commercial_lease} pending={current.categoryBreakdown.pending.commercial_lease} />
                    <CategoryBreakdownCard title="Commercial Sale" icon={BuildingIcon} closed={current.categoryBreakdown.closed.commercial_sale} pending={current.categoryBreakdown.pending.commercial_sale} />
                 </div>
            </div>
            {/*
                TODO: The RecruitingAdminConsole must be migrated to a secure Admin API route.
                It has been removed for now to prevent client-side permission errors.
            */}
        </div>
    );
}
