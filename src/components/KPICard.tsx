import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  variant?: 'default' | 'danger' | 'success';
}

export function KPICard({ title, value, subtitle, icon: Icon, variant = 'default' }: KPICardProps) {
  const iconColorClass = variant === 'danger' ? 'text-badge-danger' : variant === 'success' ? 'text-badge-success' : 'text-primary';

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <Icon className={`h-5 w-5 ${iconColorClass}`} />
        </div>
      </CardContent>
    </Card>
  );
}
