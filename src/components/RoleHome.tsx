import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from '@/components/shared';
import { homeFor } from '@/lib/roles';

/** Sends each role to its own home screen after login. */
export function RoleHome() {
  const { profile, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LoadingSpinner label="Opening your workspace..." />
      </div>
    );
  }
  return <Navigate to={homeFor(profile?.role)} replace />;
}
