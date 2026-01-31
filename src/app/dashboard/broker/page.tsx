import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DollarSign, Users, TrendingUp, Target } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ChartContainer, ChartTooltip, ChartTooltipContent, BarChart, Bar, XAxis, YAxis } from '@/components/ui/chart';
import { AgentDashboardData, User } from '@/lib/types';


// Mock data for broker dashboard
const agents: (User & { data: AgentDashboardData })[] = [
    { 
        uid: 'agent-1', name: 'Sonja Doe', email: 'sonja@example.com', role: 'agent', brokerageId: 'b1',
        data: {
            userId: 'agent-1', grade: 'A', progress: 85,
            kpis: { calls: { actual: 1250, target: 1500 }, engagements: { actual: 420, target: 500 }, appointmentsHeld: { actual: 45, target: 50 }, contractsWritten: { actual: 15, target: 12 }, closings: { actual: 9, target: 8 } },
            netEarned: 27000, netPending: 12000,
            forecast: { projectedClosings: 11, paceBasedNetIncome: 33000 }
        }
    },
    { 
        uid: 'agent-2', name: 'Michael Chen', email: 'michael@example.com', role: 'agent', brokerageId: 'b1',
        data: {
            userId: 'agent-2', grade: 'C', progress: 65,
            kpis: { calls: { actual: 800, target: 1400 }, engagements: { actual: 250, target: 450 }, appointmentsHeld: { actual: 25, target: 40 }, contractsWritten: { actual: 5, target: 8 }, closings: { actual: 3, target: 6 } },
            netEarned: 9000, netPending: 6000,
            forecast: { projectedClosings: 5, paceBasedNetIncome: 15000 }
        }
    },
    { 
        uid: 'agent-3', name: 'Alicia Rodriguez', email: 'alicia@example.com', role: 'agent', brokerageId: 'b1',
        data: {
            userId: 'agent-3', grade: 'B', progress: 78,
            kpis: { calls: { actual: 1100, target: 1300 }, engagements: { actual: 380, target: 400 }, appointmentsHeld: { actual: 40, target: 45 }, contractsWritten: { actual: 10, target: 10 }, closings: { actual: 7, target: 8 } },
            netEarned: 21000, netPending: 9000,
            forecast: { projectedClosings: 9, paceBasedNetIncome: 27000 }
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

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);


export default function BrokerDashboardPage() {
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Broker Command</h1>
                <p className="text-muted-foreground">Aggregated view of your brokerage&apos;s performance.</p>
            </div>
            
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
                                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} />
                                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                                <Bar dataKey="value" radius={5} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
                {/* Additional chart or component can go here */}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Agent Leaderboard</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Agent</TableHead>
                                <TableHead className="text-center">Grade</TableHead>
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
                                        <Badge variant={agent.data.grade === 'A' || agent.data.grade === 'B' ? 'default' : 'secondary'} className={cn(
                                            agent.data.grade === 'A' && 'bg-green-500/80',
                                            agent.data.grade === 'C' && 'bg-yellow-500/80',
                                            agent.data.grade === 'D' || agent.data.grade === 'F' ? 'bg-red-500/80' : ''
                                        )}>{agent.data.grade}</Badge>
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
}
