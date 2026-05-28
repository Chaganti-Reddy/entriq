// apps/web/components/dashboard/status-badge.tsx
import { Badge } from '@/components/ui/badge';

interface StatusBadgeProps {
  status: 'approved' | 'not_approved' | 'active' | 'inactive';
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  if (status === 'approved') {
    return <Badge variant="approved" dot className={className}>Checked in</Badge>;
  }
  if (status === 'not_approved') {
    return <Badge variant="pending" dot className={className}>Pending</Badge>;
  }
  if (status === 'active') {
    return <Badge variant="active" dot className={className}>Active</Badge>;
  }
  return <Badge variant="inactive" className={className}>Inactive</Badge>;
}
