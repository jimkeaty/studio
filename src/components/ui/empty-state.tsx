import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface EmptyStateProps {
  emoji: string;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  secondaryHref?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function EmptyState({
  emoji,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  secondaryLabel,
  secondaryHref,
  className,
  size = 'md',
}: EmptyStateProps) {
  const sizeClasses = {
    sm: { wrapper: 'py-8 px-4', emoji: 'text-4xl', title: 'text-base', desc: 'text-xs', btn: 'text-xs h-8 px-3' },
    md: { wrapper: 'py-12 px-6', emoji: 'text-5xl', title: 'text-lg', desc: 'text-sm', btn: 'text-sm' },
    lg: { wrapper: 'py-16 px-8', emoji: 'text-6xl', title: 'text-xl', desc: 'text-sm', btn: 'text-sm' },
  }[size];

  return (
    <div className={cn('flex flex-col items-center justify-center text-center', sizeClasses.wrapper, className)}>
      <div className={cn('mb-4 select-none', sizeClasses.emoji)}>{emoji}</div>
      <h3 className={cn('font-bold text-foreground mb-2', sizeClasses.title)}>{title}</h3>
      <p className={cn('text-muted-foreground max-w-xs leading-relaxed mb-6', sizeClasses.desc)}>{description}</p>
      {(actionLabel || secondaryLabel) && (
        <div className="flex items-center gap-3 flex-wrap justify-center">
          {actionLabel && (
            actionHref ? (
              <Link href={actionHref}>
                <Button size="sm" className={sizeClasses.btn}>{actionLabel}</Button>
              </Link>
            ) : (
              <Button size="sm" className={sizeClasses.btn} onClick={onAction}>{actionLabel}</Button>
            )
          )}
          {secondaryLabel && secondaryHref && (
            <Link href={secondaryHref}>
              <Button size="sm" variant="outline" className={sizeClasses.btn}>{secondaryLabel}</Button>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
