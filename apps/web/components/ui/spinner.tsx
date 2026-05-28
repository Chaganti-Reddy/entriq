// apps/web/components/ui/spinner.tsx
import { cn } from '@/lib/utils';

interface SpinnerProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Spinner({ className, size = 'md' }: SpinnerProps) {
  return (
    <div
      className={cn(
        'animate-spin rounded-full border-2 border-zinc-700 border-t-violet-500',
        {
          'w-4 h-4': size === 'sm',
          'w-6 h-6': size === 'md',
          'w-10 h-10': size === 'lg',
        },
        className
      )}
      role="status"
      aria-label="Loading"
    />
  );
}
