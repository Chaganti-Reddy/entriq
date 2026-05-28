// apps/web/components/ui/badge.tsx
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors',
  {
    variants: {
      variant: {
        approved:
          'bg-green-500/10 text-green-400 border-green-500/20',
        pending:
          'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
        active:
          'bg-green-500/10 text-green-400 border-green-500/20',
        inactive:
          'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
        info:
          'bg-blue-500/10 text-blue-400 border-blue-500/20',
        danger:
          'bg-red-500/10 text-red-400 border-red-500/20',
        brand:
          'bg-violet-500/10 text-violet-400 border-violet-500/20',
      },
    },
    defaultVariants: { variant: 'info' },
  }
);

interface BadgeProps extends VariantProps<typeof badgeVariants> {
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
}

export function Badge({ className, variant, children, dot }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)}>
      {dot && (
        <span
          className={cn('w-1.5 h-1.5 rounded-full', {
            'bg-green-400': variant === 'approved' || variant === 'active',
            'bg-yellow-400': variant === 'pending',
            'bg-zinc-400': variant === 'inactive',
            'bg-blue-400': variant === 'info',
            'bg-red-400': variant === 'danger',
            'bg-violet-400': variant === 'brand',
          })}
        />
      )}
      {children}
    </span>
  );
}
