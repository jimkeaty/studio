'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, DollarSign, Users, CheckCircle as CheckCircleIcon, TrendingUp, XCircle, MinusCircle } from 'lucide-react';
import { YtdValueMetrics } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

const formatCurrency = (amount: number | null | undefined, defaultVal: string = '—') => {
    if (amount === null || amount === undefined) return defaultVal;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
}

const StatItem = ({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) => (
    <div>
        <p className="text-sm font-medium text-muted-foreground flex items-center gap-1"><Icon className="h-4 w-4" /> {label}</p>
        <p className="text-2xl font-bold">{value}</p>
    </div>
);

const ValueMetricItem = ({
    label,
    actual,
    target
}: {
    label: string;
    actual: number | null;
    target: number | null;
}) => {
    const hasActual = actual !== null && actual > 0;
    const hasTarget = target !== null && target > 0;
    
    let GradeIcon = MinusCircle;
    let gradeColor = 'text-muted-foreground';

    if (hasActual && hasTarget) {
        if (actual >= target) {
            GradeIcon = CheckCircleIcon;
            gradeColor = 'text-green-500';
        } else if (actual >= 0.7 * target) {
            GradeIcon = TrendingUp;
            gradeColor = 'text-yellow-500';
        } else {
            GradeIcon = XCircle;
            gradeColor = 'text-red-500';
        }
    }

    return (
        <div className="flex flex-col">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold">{formatCurrency(actual)}</p>
                {hasActual && hasTarget && <GradeIcon className={cn("h-5 w-5", gradeColor)} />}
            </div>
            {hasTarget && <p className="text-xs text-muted-foreground">Target: {formatCurrency(target)}</p>}
        </div>
    );
};


export function YtdValueMetricsCard({ metrics, loading, error }: { metrics: YtdValueMetrics | null, loading: boolean, error: Error | null }) {
    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-1/2" />
                    <Skeleton className="h-4 w-3/4" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-24 w-full" />
                </CardContent>
            </Card>
        );
    }
    
    if (error) {
        return (
             <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error Loading Value Metrics</AlertTitle>
                <AlertDescription>{error.message || 'Could not fetch YTD value metrics.'}</AlertDescription>
            </Alert>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>YTD Value Metrics</CardTitle>
                <CardDescription>The calculated dollar value of your key activities based on YTD closed income.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-center md:text-left">
                    <StatItem label="Closed Net (YTD)" value={formatCurrency(metrics?.closedNetCommission)} icon={DollarSign} />
                    <StatItem label="Engagements (YTD)" value={metrics?.engagements.toLocaleString() ?? '—'} icon={Users} />
                    <StatItem label="Appts Held (YTD)" value={metrics?.appointmentsHeld.toLocaleString() ?? '—'} icon={CheckCircleIcon} />
                </div>

                <Separator />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                    {metrics && metrics.closedNetCommission > 0 ? (
                        <>
                            <ValueMetricItem
                                label="Value per Engagement"
                                actual={metrics.valuePerEngagement}
                                target={metrics.targetValuePerEngagement}
                            />
                            <ValueMetricItem
                                label="Value per Appt Held"
                                actual={metrics.valuePerAppointmentHeld}
                                target={metrics.targetValuePerAppointmentHeld}
                            />
                        </>
                    ) : (
                        <div className="col-span-full text-center text-muted-foreground text-sm p-4 bg-muted/50 rounded-md">
                           Your value metrics will appear here after your first closing of the year so they reflect real income.
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
