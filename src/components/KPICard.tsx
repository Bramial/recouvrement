import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  variant?: 'default' | 'danger' | 'success';
  trend?: { direction: 'up' | 'down'; label: string; positive: boolean } | null;
  onClick?: () => void;
}

export function KPICard({ title, value, subtitle, icon: Icon, variant = 'default', trend, onClick }: KPICardProps) {
  const iconColorClass = variant === 'danger' ? 'text-badge-danger' : variant === 'success' ? 'text-badge-success' : 'text-primary';

  return (
    <Card className={onClick ? 'cursor-pointer hover:bg-accent/50 transition-colors' : ''} onClick={onClick}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            {trend && (
              <div className={`flex items-center gap-1 text-xs font-medium ${trend.positive ? 'text-green-600' : 'text-red-600'}`}>
                {trend.direction === 'up' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                <span>{trend.label}</span>
              </div>
            )}
          </div>
          <Icon className={`h-5 w-5 ${iconColorClass}`} />
        </div>
      </CardContent>
    </Card>
  );
}
