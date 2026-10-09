import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Heart,
  Upload,
  Search,
  ChevronRight,
  Check,
  X,
  FlaskConical,
  Send,
  KeyRound,
  Loader2,
  UserCheck,
  Inbox,
  UserMinus,
} from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { StatCard, RiskBadge, EmptyState, LoadingSpinner } from '@/components/shared';
import { SharingSetupNotice, Avatar, CountBadge, SectionTitle, StatusPill } from '@/components/consent-ui';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import type { RiskLevel, Scan } from '@/lib/supabase';
import {
  consentsFor,
  forwardToPatients,
  getProfiles,
  grantAccepted,
  myCareLinks,
  myResearchRequests,
  setLinkStatus,
  setRequestStatus,
  sharedScans,
  type CareLink,
  type PublicProfile,
  type ResearchConsent,
  type ResearchRequest,
  isSharingSetupMissing,
} from '@/lib/consent';

export function DoctorDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [setupMissing, setSetupMissing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [links, setLinks] = useState<CareLink[]>([]);
  const [scans, setScans] = useState<Scan[]>([]);
  const [requests, setRequests] = useState<ResearchRequest[]>([]);
  const [consents, setConsents] = useState<ResearchConsent[]>([]);
  const [people, setPeople] = useState<Record<string, PublicProfile>>({});
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<RiskLevel | 'all'>('all');

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [l, s, r] = await Promise.all([myCareLinks(), sharedScans(user.id), myResearchRequests()]);
      const mine = r.filter((x) => x.doctor_id === user.id);
      const c = await consentsFor(mine.map((x) => x.id));
      setLinks(l.filter((x) => x.doctor_id === user.id));
      setScans(s);
      setRequests(mine);
      setConsents(c);
      setPeople(await getProfiles([...l.map((x) => x.patient_id), ...mine.map((x) => x.researcher_id)]));
    } catch (e) {
      if (isSharingSetupMissing(e)) {
        setSetupMissing(true);
        return;
      }
      toast({ title: 'Could not load doctor panel', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (key: string, fn: () => Promise<unknown>, ok: string | ((r: unknown) => string)) => {
    setBusy(key);
    try {
      const res = await fn();
      toast({ title: typeof ok === 'function' ? ok(res) : ok });
      await load();
    } catch (e) {
      toast({ title: 'Action failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const pendingLinks = links.filter((l) => l.status === 'pending');
  const patients = links.filter((l) => l.status === 'accepted');
  const patientIds = patients.map((p) => p.patient_id);
  const pendingResearch = requests.filter((r) => r.status === 'pending');
  const nameOf = (id: string) => people[id]?.full_name || 'Patient';

  const scansByPatient = useMemo(() => {
    const map: Record<string, Scan[]> = {};
    for (const s of scans) (map[s.user_id] ||= []).push(s);
    return map;
  }, [scans]);

  const highRiskPatients = patientIds.filter((id) => scansByPatient[id]?.[0]?.risk_level === 'high').length;

  const visiblePatients = patients.filter((p) => {
    const latest = scansByPatient[p.patient_id]?.[0];
    if (riskFilter !== 'all' && latest?.risk_level !== riskFilter) return false;
    return !search || nameOf(p.patient_id).toLowerCase().includes(search.toLowerCase());
  });

  if (loading) return <AppLayout><LoadingSpinner label="Loading doctor panel..." /></AppLayout>;
  if (setupMissing) return <AppLayout><SharingSetupNotice /></AppLayout>;

  return (
    <AppLayout>
      <PageHeader
        title="Doctor Panel"
        description="Manage patient connections, review linked patients' retinal scans, and handle research data requests with patient consent."
        action={
          <Button asChild>
            <Link to="/upload">
              <Upload className="mr-2 h-4 w-4" /> New Retinal Scan
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="My Patients" value={patients.length} icon={Users} />
        <StatCard label="Patient Requests" value={pendingLinks.length} icon={Inbox} accent={pendingLinks.length ? 'warning' : 'primary'} />
        <StatCard label="Research Requests" value={pendingResearch.length} icon={FlaskConical} accent={pendingResearch.length ? 'warning' : 'success'} />
        <StatCard label="High-Risk Patients" value={highRiskPatients} icon={Heart} accent={highRiskPatients ? 'destructive' : 'success'} />
      </div>

      <Tabs defaultValue={pendingLinks.length ? 'requests' : 'patients'} className="mt-6">
        <TabsList className="h-auto flex-wrap gap-1 rounded-xl bg-muted/60 p-1">
          <TabsTrigger value="patients" className="gap-2 rounded-lg data-[state=active]:shadow-md">
            <UserCheck className="h-4 w-4" /> My patients
          </TabsTrigger>
          <TabsTrigger value="requests" className="gap-2 rounded-lg data-[state=active]:shadow-md">
            <Inbox className="h-4 w-4" /> Patient requests <CountBadge n={pendingLinks.length} />
          </TabsTrigger>
          <TabsTrigger value="research" className="gap-2 rounded-lg data-[state=active]:shadow-md">
            <FlaskConical className="h-4 w-4" /> Research requests <CountBadge n={pendingResearch.length} />
          </TabsTrigger>
        </TabsList>

        {/* ---------------- Patients ---------------- */}
        <TabsContent value="patients" className="page-enter mt-5">
          <Card className="p-5">
            <SectionTitle
              icon={UserCheck}
              title="Linked patients"
              hint="Patients who chose you as their doctor"
              right={
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  <div className="relative flex-1 sm:w-56">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="Search patients" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                  </div>
                  <Select value={riskFilter} onValueChange={(v) => setRiskFilter(v as RiskLevel | 'all')}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All risk levels</SelectItem>
                      <SelectItem value="low">Low risk</SelectItem>
                      <SelectItem value="moderate">Moderate risk</SelectItem>
                      <SelectItem value="high">High risk</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              }
            />
            {patients.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No linked patients yet"
                description="Patients can find you under “My Doctors” and send a request. Accepted patients appear here with their scans."
              />
            ) : visiblePatients.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No patients match your filters.</p>
            ) : (
              <div className="stagger space-y-3">
                {visiblePatients.map((p) => {
                  const ps = scansByPatient[p.patient_id] ?? [];
                  const latest = ps[0];
                  return (
                    <div key={p.id} className="rounded-xl border border-border bg-background/40 p-4 transition-colors hover:border-primary/30">
                      <div className="flex flex-wrap items-center gap-3">
                        <Avatar name={nameOf(p.patient_id)} id={p.patient_id} size={44} />
                        <div className="min-w-0 flex-1">
                          <p className="font-display font-semibold">{nameOf(p.patient_id)}</p>
                          <p className="text-xs text-muted-foreground">
                            {ps.length} scan{ps.length === 1 ? '' : 's'} · linked {new Date(p.responded_at ?? p.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        {latest && (
                          <div className="flex items-center gap-2">
                            <RiskBadge level={latest.risk_level} />
                            <span className="text-sm font-semibold tabular-nums">
                              {latest.prediction_payload?.risk_score ?? latest.confidence}/100
                            </span>
                          </div>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!!busy}
                          onClick={() => act(p.id, () => setLinkStatus(p.id, 'revoked'), 'Patient removed from your panel')}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      </div>
                      {ps.length > 0 && (
                        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                          {ps.map((s) => (
                            <Link
                              key={s.id}
                              to={`/result/${s.id}`}
                              className="group flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-xs transition-all hover:-translate-y-0.5 hover:border-primary/40"
                            >
                              <div className="h-8 w-8 overflow-hidden rounded-md bg-black">
                                {(s.image_url || s.prediction_payload?.original_image) && (
                                  <img src={s.image_url || s.prediction_payload?.original_image} alt="" className="h-full w-full object-cover" />
                                )}
                              </div>
                              <div>
                                <p className="font-medium capitalize">{s.risk_level} · {s.prediction_payload?.risk_score ?? s.confidence}</p>
                                <p className="text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</p>
                              </div>
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ---------------- Patient requests ---------------- */}
        <TabsContent value="requests" className="page-enter mt-5">
          <Card className="p-5">
            <SectionTitle icon={Inbox} title="Patients asking to connect" hint="Accepting lets you view that patient's retinal scans" />
            {pendingLinks.length === 0 ? (
              <EmptyState icon={Inbox} title="No pending requests" description="New patient requests will appear here." />
            ) : (
              <div className="stagger space-y-3">
                {pendingLinks.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/25 bg-warning/5 p-4">
                    <Avatar name={nameOf(l.patient_id)} id={l.patient_id} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="font-display font-semibold">{nameOf(l.patient_id)}</p>
                      <p className="text-xs text-muted-foreground">Requested {new Date(l.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act(l.id + 'd', () => setLinkStatus(l.id, 'declined'), 'Request declined')}>
                        <X className="mr-1 h-4 w-4" /> Decline
                      </Button>
                      <Button size="sm" disabled={!!busy} onClick={() => act(l.id + 'a', () => setLinkStatus(l.id, 'accepted'), `${nameOf(l.patient_id)} added to your patients`)}>
                        {busy === l.id + 'a' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                        Accept
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ---------------- Research requests ---------------- */}
        <TabsContent value="research" className="page-enter mt-5">
          {requests.length === 0 ? (
            <Card className="p-5">
              <EmptyState icon={FlaskConical} title="No research requests" description="When a researcher asks you for data, it appears here." />
            </Card>
          ) : (
            <div className="stagger space-y-4">
              {requests.map((r) => {
                const rc = consents.filter((c) => c.request_id === r.id);
                const count = (s: string) => rc.filter((c) => c.status === s).length;
                const accepted = count('accepted');
                const asked = new Set(rc.map((c) => c.patient_id));
                const notAsked = patientIds.filter((id) => !asked.has(id));
                return (
                  <Card key={r.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <Avatar name={people[r.researcher_id]?.full_name} id={r.researcher_id} size={44} />
                        <div className="min-w-0">
                          <p className="font-display text-lg font-semibold">{r.title}</p>
                          <p className="text-xs text-muted-foreground">
                            from {people[r.researcher_id]?.full_name || 'Researcher'} (researcher) · {new Date(r.created_at).toLocaleDateString()}
                          </p>
                          {r.purpose && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{r.purpose}</p>}
                        </div>
                      </div>
                      <StatusPill status={r.status} />
                    </div>

                    {r.status !== 'pending' && r.status !== 'declined' && (
                      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {[
                          ['Asked', rc.length, 'text-foreground'],
                          ['Waiting', count('pending'), 'text-warning'],
                          ['Accepted', accepted, 'text-success'],
                          ['Declined', count('declined') + count('revoked'), 'text-destructive'],
                          ['Shared', count('granted'), 'text-violet-300'],
                        ].map(([label, n, cls]) => (
                          <div key={label as string} className="rounded-xl border border-border bg-background/40 p-2.5 text-center">
                            <p className={`font-display text-xl font-bold ${cls}`}>{n as number}</p>
                            <p className="text-[11px] text-muted-foreground">{label}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {rc.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {rc.map((c) => (
                          <span key={c.id} className="inline-flex items-center gap-2 rounded-full border border-border bg-background/40 py-1 pl-1 pr-2 text-xs">
                            <Avatar name={nameOf(c.patient_id)} id={c.patient_id} size={20} />
                            {nameOf(c.patient_id)}
                            <StatusPill status={c.status} />
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                      {r.status === 'pending' && (
                        <>
                          <Button
                            disabled={!!busy || patientIds.length === 0}
                            onClick={() =>
                              act(r.id + 'f', () => forwardToPatients(r.id, patientIds), (n) => `Sent to ${n} patient${n === 1 ? '' : 's'} for consent`)
                            }
                          >
                            {busy === r.id + 'f' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                            Send request to my {patientIds.length} patient{patientIds.length === 1 ? '' : 's'}
                          </Button>
                          <Button variant="outline" disabled={!!busy} onClick={() => act(r.id + 'd', () => setRequestStatus(r.id, 'declined'), 'Research request declined')}>
                            <X className="mr-2 h-4 w-4" /> Decline
                          </Button>
                          {patientIds.length === 0 && <p className="text-xs text-muted-foreground">You need linked patients before forwarding.</p>}
                        </>
                      )}

                      {(r.status === 'forwarded' || r.status === 'granted') && (
                        <>
                          <Button
                            disabled={!!busy || accepted === 0}
                            className={accepted ? 'conic-border' : ''}
                            onClick={() =>
                              act(r.id + 'g', () => grantAccepted(r.id), (n) => `Access granted for ${n} consenting patient${n === 1 ? '' : 's'}`)
                            }
                          >
                            {busy === r.id + 'g' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                            Give access{accepted ? ` (${accepted})` : ''}
                          </Button>
                          {notAsked.length > 0 && (
                            <Button
                              variant="outline"
                              disabled={!!busy}
                              onClick={() => act(r.id + 'n', () => forwardToPatients(r.id, notAsked), (n) => `Sent to ${n} more patient${n === 1 ? '' : 's'}`)}
                            >
                              <Send className="mr-2 h-4 w-4" /> Send to {notAsked.length} new patient{notAsked.length === 1 ? '' : 's'}
                            </Button>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {accepted
                              ? 'Only patients who accepted will be shared — under a pseudonym.'
                              : 'Give access unlocks once at least one patient accepts.'}
                          </p>
                        </>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}

