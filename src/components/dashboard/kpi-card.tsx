import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { LucideIcon } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface KpiCardProps {
  title: string;
  icon: LucideIcon;
  actual: number;
  target: number;
}

export function KpiCard({ title, icon: Icon, actual, target }: KpiCardProps) {
  const percentage = target > 0 ? Math.round((actual / target) * 100) : 100;
  const isExceeded = actual >= target;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{actual.toLocaleString()}</div>
        <p className={`text-xs ${isExceeded ? 'text-green-500' : 'text-muted-foreground'}`}>
          {percentage}% of target ({target.toLocaleString()})
        </p>
        <Progress value={Math.min(percentage, 100)} className="mt-2 h-2" />
      </CardContent>
    </Card>
  );
}
