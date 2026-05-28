// apps/web/components/dashboard/stat-card.tsx
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: number | string;
  sub?: string;
  icon?: LucideIcon;
  accentColor?: 'violet' | 'green' | 'yellow' | 'default';
  className?: string;
}

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accentColor = 'default',
  className,
}: StatCardProps) {
  const iconColors = {
    violet: 'bg-violet-500/10 border-violet-500/20 text-violet-400',
    green:  'bg-green-500/10  border-green-500/20  text-green-400',
    yellow: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400',
    default:'bg-zinc-800      border-zinc-700       text-zinc-400',
  };

  return (
    <div className={cn('bg-zinc-900 border border-zinc-800 rounded-2xl p-5', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">
            {label}
          </p>
          <p className="text-3xl font-bold text-zinc-100 tabular-nums">{value}</p>
          {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
        </div>
        {Icon && (
          <div
            className={cn(
              'w-9 h-9 rounded-xl border flex items-center justify-center shrink-0',
              iconColors[accentColor]
            )}
          >
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
    </div>
  );
}
