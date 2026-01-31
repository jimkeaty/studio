import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { LucideIcon } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  title: string;
  icon: LucideIcon;
  actual: number;
  target: number;
  performance: number; // 0-100+
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  isGracePeriod: boolean;
}

export function KpiCard({ title, icon: Icon, actual, target, performance, grade, isGracePeriod }: KpiCardProps) {
  
  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A': return 'bg-green-500/90';
      case 'B': return 'bg-primary';
      case 'C': return 'bg-yellow-500/90';
      case 'D': return 'bg-orange-500/80';
      case 'F': return 'bg-red-500/90';
      default: return 'bg-secondary';
    }
  };
  
  const finalGrade = isGracePeriod ? 'A' : grade;
  const performanceText = isGracePeriod 
    ? "Grace Period — establishing baseline" 
    : `${performance}% of target (${target.toLocaleString()})`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline justify-between">
            <div className="text-2xl font-bold">{actual.toLocaleString()}</div>
            <Badge className={cn('text-primary-foreground', getGradeColor(finalGrade))}>
                {finalGrade}
            </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {performanceText}
        </p>
        <Progress value={isGracePeriod ? 100 : Math.min(performance, 100)} className="mt-2 h-2" />
      </CardContent>
    </Card>
  );
}
