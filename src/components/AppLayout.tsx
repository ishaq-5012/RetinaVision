import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Upload,
  BarChart3,
  Users,
  Activity,
  LogOut,
  Heart,
  ScanEye,
  Stethoscope,
  Menu,
  ShieldCheck,
  FlaskConical,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { CountBadge } from '@/components/consent-ui';
import { consentsFor, myCareLinks, myResearchRequests } from '@/lib/consent';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

const patientNav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/upload', label: 'New Scan', icon: Upload },
  { to: '/history', label: 'Scan History', icon: Activity },
  { to: '/care', label: 'My Doctors', icon: ShieldCheck },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
];

const doctorNav = [
  { to: '/doctor', label: 'Dashboard', icon: Stethoscope },
  { to: '/upload', label: 'New Scan', icon: Upload },
  { to: '/history', label: 'My Scans', icon: Activity },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
];

const researcherNav = [
  { to: '/research', label: 'Dashboard', icon: FlaskConical },
];

/** Pending-action counts per nav target, refreshed on every page. */
function useNavBadges(role?: string, userId?: string) {
  const location = useLocation();
  const [badges, setBadges] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!userId || !role) return;
    let alive = true;
    (async () => {
      try {
        if (role === 'patient') {
          const c = await consentsFor();
          if (alive) setBadges({ '/care': c.filter((x) => x.patient_id === userId && x.status === 'pending').length });
        } else if (role === 'doctor') {
          const [l, r] = await Promise.all([myCareLinks(), myResearchRequests()]);
          const n =
            l.filter((x) => x.doctor_id === userId && x.status === 'pending').length +
            r.filter((x) => x.doctor_id === userId && x.status === 'pending').length;
          if (alive) setBadges({ '/doctor': n });
        }
      } catch {
        /* sharing tables not migrated yet — no badges */
      }
    })();
    return () => {
      alive = false;
    };
  }, [role, userId, location.pathname]);
  return badges;
}

export function AppSidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { profile, signOut, user } = useAuth();
  const navigate = useNavigate();
  const badges = useNavBadges(profile?.role, user?.id);

  const navItems =
    profile?.role === 'doctor'
      ? doctorNav
      : profile?.role === 'researcher'
        ? researcherNav
        : patientNav;

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <aside className="flex h-full w-64 flex-col border-r border-border/70 bg-card/80 backdrop-blur-xl">
      <Link to="/home" onClick={onNavigate} className="flex items-center gap-3 px-6 py-5 transition-opacity hover:opacity-90">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl gradient-medical shadow-lg shadow-primary/30">
          <ScanEye className="h-5 w-5 text-white" />
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-success" />
        </div>
        <div>
          <p className="font-display text-sm font-bold tracking-tight">CardioVisionAI</p>
          <p className="text-[11px] capitalize text-muted-foreground">
            {profile?.role === 'doctor' ? 'Doctor workspace' : profile?.role === 'researcher' ? 'Research workspace' : 'Retinal Risk Screening'}
          </p>
        </div>
      </Link>

      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      <p className="px-6 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
        Workspace
      </p>
      <nav className="stagger flex-1 space-y-1 px-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300',
                isActive
                  ? 'bg-gradient-to-r from-primary/15 to-primary/5 text-primary shadow-sm'
                  : 'text-muted-foreground hover:translate-x-1 hover:bg-muted/70 hover:text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary transition-all duration-300',
                    isActive ? 'opacity-100' : 'scale-y-0 opacity-0',
                  )}
                />
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-300',
                    isActive
                      ? 'gradient-medical text-white shadow-md shadow-primary/30'
                      : 'bg-muted/60 group-hover:bg-primary/10 group-hover:text-primary',
                  )}
                >
                  <item.icon className="h-4 w-4" />
                </span>
                {item.label}
                <CountBadge n={badges[item.to] ?? 0} />
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mx-3 mb-3 rounded-xl border border-primary/15 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-3">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          AI engines online
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Retinal analysis · AI interpretation</p>
      </div>

      <div className="border-t border-border/70 p-3">
        <div className="mb-3 flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-blue-600 text-sm font-bold text-white shadow-md shadow-primary/30">
            {(profile?.full_name || 'U').trim().charAt(0).toUpperCase() || <Heart className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{profile?.full_name || 'User'}</p>
            <p className="truncate text-[11px] capitalize text-muted-foreground">
              {profile?.role || 'patient'}
            </p>
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive">
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sign out?</AlertDialogTitle>
              <AlertDialogDescription>
                You will be returned to the landing page. Your data remains saved.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleSignOut}>Sign Out</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </aside>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <div className="sticky top-0 hidden h-screen lg:block">
        <AppSidebar />
      </div>
      <main className="flex-1 overflow-x-hidden">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-40 flex items-center justify-between border-b border-border/70 bg-card/80 px-4 py-3 backdrop-blur-xl lg:hidden">
          <Link to="/home" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-medical shadow-md shadow-primary/30">
              <ScanEye className="h-4 w-4 text-white" />
            </div>
            <span className="font-display text-sm font-bold">CardioVisionAI</span>
          </Link>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <AppSidebar onNavigate={() => setMenuOpen(false)} />
            </SheetContent>
          </Sheet>
        </div>

        {/* Keyed by route so every page transition animates */}
        <div key={location.pathname} className="page-enter mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

export { Users };
