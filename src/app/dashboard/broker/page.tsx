'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DollarSign, Users, TrendingUp, Target } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid } from '@/components/ui/chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AgentDashboardData, User } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Scoreboard } from '@/components/dashboard/broker/scoreboard';


// Mock data for broker dashboard
const agents: (User & { data: AgentDashboardData })[] = [
    { 
        uid: 'agent-1', name: 'Sonja Doe', email: 'sonja@example.com', role: 'agent', brokerageId: 'b1',
        data: {
            userId: 'agent-1',
            leadIndicatorGrade: 'A',
            leadIndicatorPerformance: 99,
            isLeadIndicatorGracePeriod: false,
            incomeGrade: 'A',
            incomePerformance: 99,
            isIncomeGracePeriod: false,
            expectedYTDIncomeGoal: 30000,
            ytdTotalPotential: 39000,
            pipelineAdjustedIncome: { grade: 'A', performance: 110 },
            kpis: { calls: { actual: 1250, target: 1500, performance: 83, grade: 'C' }, engagements: { actual: 420, target: 500, performance: 84, grade: 'C' }, appointmentsSet: { actual: 50, target: 55, performance: 91, grade: 'B' }, appointmentsHeld: { actual: 45, target: 50, performance: 90, grade: 'B' }, contractsWritten: { actual: 15, target: 12, performance: 125, grade: 'A' }, closings: { actual: 9, target: 8, performance: 113, grade: 'A' } },
            netEarned: 27000, netPending: 12000,
            monthlyIncome: [],
            totalClosedIncomeForYear: 27000,
            totalPendingIncomeForYear: 12000,
            totalIncomeWithPipelineForYear: 39000,
            forecast: { projectedClosings: 11, paceBasedNetIncome: 33000 },
            conversions: { callToEngagement: { actual: 0.336, plan: 0.25 }, engagementToAppointmentSet: { actual: 0.119, plan: 0.1 }, appointmentSetToHeld: { actual: 0.9, plan: 0.9 }, appointmentHeldToContract: { actual: 0.333, plan: 0.2 }, contractToClosing: { actual: 0.6, plan: 0.8 } },
            stats: { ytdVolume: 2700000, avgSalesPrice: 300000, buyerClosings: 6, sellerClosings: 3, renterClosings: 0, avgCommission: 3000, engagementValue: 64.28 }
        }
    },
    { 
        uid: 'agent-2', name: 'Michael Chen', email: 'michael@example.com', role: 'agent', brokerageId: 'b1',
        data: {
            userId: 'agent-2',
            leadIndicatorGrade: 'C',
            leadIndicatorPerformance: 65,
            isLeadIndicatorGracePeriod: false,
            incomeGrade: 'C',
            incomePerformance: 60,
            isIncomeGracePeriod: false,
            expectedYTDIncomeGoal: 15000,
            ytdTotalPotential: 15000,
            pipelineAdjustedIncome: { grade: 'B', performance: 100 },
            kpis: { calls: { actual: 800, target: 1400, performance: 57, grade: 'F' }, engagements: { actual: 250, target: 450, performance: 56, grade: 'F' }, appointmentsSet: { actual: 28, target: 45, performance: 62, grade: 'D' }, appointmentsHeld: { actual: 25, target: 40, performance: 63, grade: 'D' }, contractsWritten: { actual: 5, target: 8, performance: 63, grade: 'D' }, closings: { actual: 3, target: 6, performance: 50, grade: 'F' } },
            netEarned: 9000, netPending: 6000,
            monthlyIncome: [],
            totalClosedIncomeForYear: 9000,
            totalPendingIncomeForYear: 6000,
            totalIncomeWithPipelineForYear: 15000,
            forecast: { projectedClosings: 5, paceBasedNetIncome: 15000 },
            conversions: { callToEngagement: { actual: 0.3125, plan: 0.25 }, engagementToAppointmentSet: { actual: 0.1, plan: 0.1 }, appointmentSetToHeld: { actual: 0.89, plan: 0.9 }, appointmentHeldToContract: { actual: 0.2, plan: 0.2 }, contractToClosing: { actual: 0.6, plan: 0.8 } },
            stats: { ytdVolume: 900000, avgSalesPrice: 300000, buyerClosings: 2, sellerClosings: 1, renterClosings: 0, avgCommission: 3000, engagementValue: 60 }
        }
    },
    { 
        uid: 'agent-3', name: 'Alicia Rodriguez', email: 'alicia@example.com', role: 'agent', brokerageId: 'b1',
        data: {
            userId: 'agent-3',
            leadIndicatorGrade: 'B',
            leadIndicatorPerformance: 78,
            isLeadIndicatorGracePeriod: false,
            incomeGrade: 'B',
            incomePerformance: 88,
            isIncomeGracePeriod: false,
            expectedYTDIncomeGoal: 24000,
            ytdTotalPotential: 30000,
            pipelineAdjustedIncome: { grade: 'A', performance: 125 },
            kpis: { calls: { actual: 1100, target: 1300, performance: 85, grade: 'B' }, engagements: { actual: 380, target: 400, performance: 95, grade: 'A' }, appointmentsSet: { actual: 42, target: 40, performance: 105, grade: 'A' }, appointmentsHeld: { actual: 40, target: 45, performance: 89, grade: 'B' }, contractsWritten: { actual: 10, target: 10, performance: 100, grade: 'A' }, closings: { actual: 7, target: 8, performance: 88, grade: 'B' } },
            netEarned: 21000, netPending: 9000,
            monthlyIncome: [],
            totalClosedIncomeForYear: 21000,
            totalPendingIncomeForYear: 9000,
            totalIncomeWithPipelineForYear: 30000,
            forecast: { projectedClosings: 9, paceBasedNetIncome: 27000 },
            conversions: { callToEngagement: { actual: 0.34, plan: 0.25 }, engagementToAppointmentSet: { actual: 0.105, plan: 0.1 }, appointmentSetToHeld: { actual: 0.95, plan: 0.9 }, appointmentHeldToContract: { actual: 0.25, plan: 0.2 }, contractToClosing: { actual: 0.7, plan: 0.8 } },
            stats: { ytdVolume: 2100000, avgSalesPrice: 300000, buyerClosings: 5, sellerClosings: 2, renterClosings: 0, avgCommission: 3000, engagementValue: 71.05 }
        }
    },
];

const totalNetEarned = agents.reduce((sum, agent) => sum + agent.data.netEarned, 0);
const totalNetPending = agents.reduce((sum, agent) => sum + agent.data.netPending, 0);
const totalClosings = agents.reduce((sum, agent) => sum + agent.data.kpis.closings.actual, 0);
const totalAppointmentsHeld = agents.reduce((sum, agent) => sum + agent.data.kpis.appointmentsHeld.actual, 0);
const totalContractsWritten = agents.reduce((sum, agent) => sum + agent.data.kpis.contractsWritten.actual, 0);

const funnelData = [
  { name: 'Appts Held', value: totalAppointmentsHeld, fill: 'var(--color-chart-1)' },
  { name: 'Contracts', value: totalContractsWritten, fill: 'var(--color-chart-2)' },
  { name: 'Closings', value: totalClosings, fill: 'var(--color-primary)' },
];

const monthlyBrokerGciData = {
  year: 2024,
  months: [
    { month: 'Jan', closedBrokerGci: 10000, pendingBrokerGci: 5000, brokerGciGoal: 12000 },
    { month: 'Feb', closedBrokerGci: 13000, pendingBrokerGci: 2000, brokerGciGoal: 12000 },
    { month: 'Mar', closedBrokerGci: 9000,  pendingBrokerGci: 8000, brokerGciGoal: 12000 },
    { month: 'Apr', closedBrokerGci: 16000, pendingBrokerGci: 4000, brokerGciGoal: 15000 },
    { month: 'May', closedBrokerGci: 14400, pendingBrokerGci: 6000, brokerGciGoal: 15000 },
    { month: 'Jun', closedBrokerGci: 19000, pendingBrokerGci: 10000, brokerGciGoal: 18000 },
    { month: 'Jul', closedBrokerGci: 0, pendingBrokerGci: 8000, brokerGciGoal: 18000 },
    { month: 'Aug', closedBrokerGci: 0, pendingBrokerGci: 5000, brokerGciGoal: 18000 },
    { month: 'Sep', closedBrokerGci: 0, pendingBrokerGci: 0, brokerGciGoal: 18000 },
    { month: 'Oct', closedBrokerGci: 0, pendingBrokerGci: 0, brokerGciGoal: 18000 },
    { month: 'Nov', closedBrokerGci: 0, pendingBrokerGci: 0, brokerGciGoal: 18000 },
    { month: 'Dec', closedBrokerGci: 0, pendingBrokerGci: 0, brokerGciGoal: 18000 },
  ],
};


const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);

export default function BrokerDashboardPage() {
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
    
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Broker Command</h1>
                <p className="text-muted-foreground">Aggregated view of your brokerage&apos;s performance.</p>
            </div>
            
            <Scoreboard />
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Net Earned</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(totalNetEarned)}</div>
                        <p className="text-xs text-muted-foreground">Commission from all closed transactions.</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Net Pending</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(totalNetPending)}</div>
                        <p className="text-xs text-muted-foreground">Commission from all pending deals.</p>
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
                        <div className="text-2xl font-bold">{agents.length}</div>
                        <p className="text-xs text-muted-foreground">Number of agents in your brokerage.</p>
                    </CardContent>
                </Card>
            </div>
            
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Monthly Broker Net Income (Closed + Pending vs. Goal)</CardTitle>
                            <CardDescription>
                                Broker net income breakdown for {selectedYear}.
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
                        config={{
                            closedBrokerGci: { label: 'Net (Closed)', color: 'hsl(var(--primary))' },
                            pendingBrokerGci: { label: 'Net (Pending)', color: 'hsl(var(--chart-2))' },
                            brokerGciGoal: { label: 'Net Goal', color: 'hsl(var(--muted-foreground))' },
                        }}
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
                                content={({ active, payload, label }) => {
                                    if (active && payload?.length) {
                                        const data = payload[0].payload;
                                        const totalPotential = data.closedBrokerGci + data.pendingBrokerGci;
                                        return (
                                            <div className="rounded-lg border bg-background p-2 shadow-sm">
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="flex flex-col">
                                                        <span className="text-[0.70rem] uppercase text-muted-foreground">
                                                            {label}
                                                        </span>
                                                        <span className="font-bold text-foreground">
                                                            {formatCurrency(totalPotential)}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="mt-2 grid gap-1.5 text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <span className="flex h-2 w-2 shrink-0 rounded-full bg-[var(--color-closedBrokerGci)]" />
                                                        <div className="flex-1">
                                                            <span>Net (Closed)</span>
                                                        </div>
                                                        <span className="font-mono font-medium tabular-nums text-foreground">
                                                            {formatCurrency(data.closedBrokerGci)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="flex h-2 w-2 shrink-0 rounded-full bg-[var(--color-pendingBrokerGci)]" />
                                                        <div className="flex-1">
                                                            <span>Net (Pending)</span>
                                                        </div>
                                                        <span className="font-mono font-medium tabular-nums text-foreground">
                                                            {formatCurrency(data.pendingBrokerGci)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-3 w-[2px] shrink-0 rounded-full bg-[var(--color-brokerGciGoal)]" />
                                                        <div className="flex-1">
                                                            <span>Net Goal</span>
                                                        </div>
                                                        <span className="font-mono font-medium tabular-nums text-foreground">
                                                            {formatCurrency(data.brokerGciGoal)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
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
                        <CardDescription>Appointments to closings conversion overview.</CardDescription>
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
                    <CardDescription>Top performing agents in your brokerage based on Net Earned YTD.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Agent</TableHead>
                                <TableHead className="text-center">Lead Grade</TableHead>
                                <TableHead className="text-center">Income Grade</TableHead>
                                <TableHead className="text-right">Net Earned</TableHead>
                                <TableHead className="text-right">Net Pending</TableHead>
                                <TableHead className="text-right">Closings</TableHead>
                                <TableHead className="text-right">Contracts</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {agents.sort((a,b) => b.data.netEarned - a.data.netEarned).map((agent) => (
                                <TableRow key={agent.uid}>
                                    <TableCell>
                                        <div className="font-medium">{agent.name}</div>
                                        <div className="text-sm text-muted-foreground">{agent.email}</div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Badge className={cn(
                                            'text-lg px-2',
                                            agent.data.leadIndicatorGrade === 'A' && 'bg-green-500/80',
                                            agent.data.leadIndicatorGrade === 'B' && 'bg-primary',
                                            agent.data.leadIndicatorGrade === 'C' && 'bg-yellow-500/80',
                                            agent.data.leadIndicatorGrade === 'D' && 'bg-orange-500/80',
                                            agent.data.leadIndicatorGrade === 'F' && 'bg-red-500/80',
                                        )}>{agent.data.leadIndicatorGrade}</Badge>
                                    </TableCell>
                                     <TableCell className="text-center">
                                        <Badge className={cn(
                                            'text-lg px-2',
                                            agent.data.incomeGrade === 'A' && 'bg-green-500/80',
                                            agent.data.incomeGrade === 'B' && 'bg-primary',
                                            agent.data.incomeGrade === 'C' && 'bg-yellow-500/80',
                                            agent.data.incomeGrade === 'D' && 'bg-orange-500/80',
                                            agent.data.incomeGrade === 'F' && 'bg-red-500/80',
                                        )}>{agent.data.incomeGrade}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right">{formatCurrency(agent.data.netEarned)}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(agent.data.netPending)}</TableCell>
                                    <TableCell className="text-right">{agent.data.kpis.closings.actual}</TableCell>
                                    <TableCell className="text-right">{agent.data.kpis.contractsWritten.actual}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );

    