import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { loading, isAdmin } = useAuth();
  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Chargement...</div>;
  }
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
