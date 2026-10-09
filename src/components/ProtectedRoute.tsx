import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { homeFor, type Role } from '@/lib/roles';

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

/**
 * Restricts a group of routes to some roles; anyone else is sent to their
 * own dashboard instead of seeing another role's screens.
 */
export function RoleRoute({ allow }: { allow: Role[] }) {
  const { profile, loading } = useAuth();
  if (loading) return null;
  const role = (profile?.role ?? 'patient') as Role;
  if (!allow.includes(role)) return <Navigate to={homeFor(role)} replace />;
  return <Outlet />;
}
