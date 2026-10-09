import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Upload,
  Search,
  ScanEye,
  ChevronRight,
  Calendar,
  Filter,
} from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { RiskBadge, EmptyState, LoadingSpinner } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { supabase, type Scan, type RiskLevel } from '@/lib/supabase';

export function ScanHistoryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<RiskLevel | 'all'>('all');

  useEffect(() => {
    async function loadScans() {
      if (!user) return;
      const { data } = await supabase
        .from('scans')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setScans((data as Scan[]) ?? []);
      setLoading(false);
    }
    loadScans();
  }, [user]);

  const filtered = useMemo(() => {
    return scans.filter((s) => {
      if (riskFilter !== 'all' && s.risk_level !== riskFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const age = s.clinical_snapshot?.age;
        return (
          new Date(s.created_at).toLocaleDateString().toLowerCase().includes(q) ||
          String(age ?? '').includes(q) ||
          s.risk_level.includes(q)
        );
      }
      return true;
    });
  }, [scans, search, riskFilter]);

  return (
    <AppLayout>
      <PageHeader
        title="Scan History"
        description="All your retinal cardiovascular risk screenings"
        action={
          <Button onClick={() => navigate('/upload')}>
            <Upload className="mr-2 h-4 w-4" /> New Scan
          </Button>
        }
      />

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by date, age, risk level..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={riskFilter}
          onValueChange={(v) => setRiskFilter(v as RiskLevel | 'all')}
        >
          <SelectTrigger className="sm:w-48">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risk Levels</SelectItem>
            <SelectItem value="low">Low Risk</SelectItem>
            <SelectItem value="moderate">Moderate Risk</SelectItem>
            <SelectItem value="high">High Risk</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <LoadingSpinner label="Loading scans..." />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ScanEye}
          title={scans.length === 0 ? 'No scans yet' : 'No matching scans'}
          description={
            scans.length === 0
              ? 'Upload your first retinal fundus image to get started.'
              : 'Try adjusting your search or filter.'
          }
          action={
            scans.length === 0 ? (
              <Button onClick={() => navigate('/upload')}>
                <Upload className="mr-2 h-4 w-4" /> Upload Retina Image
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4">
          {filtered.map((scan) => (
            <Link
              key={scan.id}
              to={`/result/${scan.id}`}
              className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md"
            >
              {scan.image_url ? (
                <img
                  src={scan.image_url}
                  alt="Retina"
                  className="h-16 w-16 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted">
                  <ScanEye className="h-7 w-7 text-muted-foreground" />
                </div>
              )}
              <div className="flex flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <RiskBadge level={scan.risk_level} />
                    <span className="text-xs text-muted-foreground">
                      Risk score: {scan.confidence}/100
                    </span>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {new Date(scan.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-6 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Age</p>
                    <p className="font-semibold">{scan.clinical_snapshot?.age ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">BP</p>
                    <p className="font-semibold">
                      {scan.clinical_snapshot?.systolic_bp}/{scan.clinical_snapshot?.diastolic_bp}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">High Risk</p>
                    <p className="font-semibold text-destructive">{scan.probability_high}%</p>
                  </div>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </Link>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
