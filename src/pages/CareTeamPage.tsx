import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, FlaskConical, Loader2, Search, ShieldCheck, Stethoscope, UserPlus, X, Undo2, Lock } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, LoadingSpinner } from '@/components/shared';
import { SharingSetupNotice, Avatar, FlowSteps, SectionTitle, StatusPill } from '@/components/consent-ui';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  consentsFor,
  getProfiles,
  listDoctors,
  myCareLinks,
  myResearchRequests,
  requestDoctor,
  setConsentStatus,
  setLinkStatus,
  type CareLink,
  type PublicProfile,
  type ResearchConsent,
  type ResearchRequest,
  isSharingSetupMissing,
} from '@/lib/consent';

export function CareTeamPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [setupMissing, setSetupMissing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [doctors, setDoctors] = useState<PublicProfile[]>([]);
  const [links, setLinks] = useState<CareLink[]>([]);
  const [consents, setConsents] = useState<ResearchConsent[]>([]);
  const [requests, setRequests] = useState<Record<string, ResearchRequest>>({});
  const [people, setPeople] = useState<Record<string, PublicProfile>>({});
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [docs, l, c, r] = await Promise.all([listDoctors(), myCareLinks(), consentsFor(), myResearchRequests()]);
      setDoctors(docs);
      setLinks(l.filter((x) => x.patient_id === user.id));
      setConsents(c.filter((x) => x.patient_id === user.id));
      setRequests(Object.fromEntries(r.map((x) => [x.id, x])));
      setPeople(await getProfiles([...docs.map((d) => d.id), ...r.flatMap((x) => [x.doctor_id, x.researcher_id])]));
    } catch (e) {
      if (isSharingSetupMissing(e)) {
        setSetupMissing(true);
        return;
      }
      toast({ title: 'Could not load sharing data', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast({ title: ok });
      await load();
    } catch (e) {
      toast({ title: 'Action failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const linkByDoctor = useMemo(() => Object.fromEntries(links.map((l) => [l.doctor_id, l])), [links]);
  const careTeam = links.filter((l) => l.status === 'accepted' || l.status === 'pending');
  const pendingConsents = consents.filter((c) => c.status === 'pending');
  const pastConsents = consents.filter((c) => c.status !== 'pending');
  const filteredDoctors = doctors.filter((d) => d.full_name.toLowerCase().includes(query.toLowerCase()));

  if (loading) return <AppLayout><LoadingSpinner label="Loading your care team..." /></AppLayout>;
  if (setupMissing) return <AppLayout><SharingSetupNotice /></AppLayout>;

  return (
    <AppLayout>
      <PageHeader
        title="My Doctors & Data Sharing"
        description="Choose which doctors can see your scans, and decide whether your data may be used for research. You stay in control and can revoke access at any time."
      />

      {/* How it works */}
      <Card className="mb-6 overflow-hidden p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex items-center gap-3 lg:w-64">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-lg">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">Consent-first sharing</p>
              <p className="text-xs text-muted-foreground">Nothing is shared without your approval</p>
            </div>
          </div>
          <div className="flex-1">
            <FlowSteps
              steps={['You request a doctor', 'Doctor accepts', 'Research request', 'You consent', 'Doctor grants']}
              current={careTeam.some((l) => l.status === 'accepted') ? (consents.length ? 3 : 2) : careTeam.length ? 1 : 0}
            />
          </div>
        </div>
      </Card>

      {/* Pending research consents */}
      {pendingConsents.length > 0 && (
        <Card className="conic-border mb-6 p-5">
          <SectionTitle
            icon={FlaskConical}
            title="Research requests waiting for your decision"
            hint="A researcher asked your doctor for data. Your doctor can only share it if you accept."
          />
          <div className="stagger space-y-3">
            {pendingConsents.map((c) => {
              const r = requests[c.request_id];
              return (
                <div key={c.id} className="rounded-xl border border-primary/25 bg-primary/5 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-display font-semibold">{r?.title ?? 'Research study'}</p>
                      {r?.purpose && <p className="mt-1 text-sm text-muted-foreground">{r.purpose}</p>}
                      <p className="mt-2 text-xs text-muted-foreground">
                        Researcher: <span className="text-foreground">{people[r?.researcher_id ?? '']?.full_name || 'Researcher'}</span> · via
                        Dr. <span className="text-foreground">{people[r?.doctor_id ?? '']?.full_name || 'your doctor'}</span>
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Lock className="h-3 w-3" /> Researchers receive your scans under a pseudonym — never your name.
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!busy}
                        onClick={() => act(c.id + 'd', () => setConsentStatus(c.id, 'declined'), 'Request declined')}
                      >
                        <X className="mr-1 h-4 w-4" /> Decline
                      </Button>
                      <Button
                        size="sm"
                        disabled={!!busy}
                        onClick={() => act(c.id + 'a', () => setConsentStatus(c.id, 'accepted'), 'Consent given — your doctor can now grant access')}
                      >
                        {busy === c.id + 'a' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                        Accept
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Care team */}
        <Card className="p-5 lg:col-span-2">
          <SectionTitle icon={Stethoscope} title="My care team" hint="Doctors who can view your scans" />
          {careTeam.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              You haven't connected with a doctor yet. Choose one from the list to send a request.
            </p>
          ) : (
            <div className="stagger space-y-2.5">
              {careTeam.map((l) => {
                const d = people[l.doctor_id];
                return (
                  <div key={l.id} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3">
                    <Avatar name={d?.full_name} id={l.doctor_id} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">Dr. {d?.full_name || 'Doctor'}</p>
                      <StatusPill status={l.status} label={l.status === 'accepted' ? 'Can view your scans' : 'Awaiting doctor'} />
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!!busy}
                      onClick={() =>
                        act(l.id, () => setLinkStatus(l.id, 'revoked'), l.status === 'accepted' ? 'Doctor access removed' : 'Request withdrawn')
                      }
                    >
                      <Undo2 className="mr-1 h-4 w-4" /> {l.status === 'accepted' ? 'Remove' : 'Withdraw'}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {pastConsents.length > 0 && (
            <>
              <h3 className="mb-2 mt-6 text-sm font-semibold">Research sharing history</h3>
              <div className="space-y-2">
                {pastConsents.map((c) => {
                  const r = requests[c.request_id];
                  return (
                    <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-sm">
                      <span className="min-w-0 flex-1 truncate">{r?.title ?? 'Research study'}</span>
                      <StatusPill status={c.status} />
                      {(c.status === 'accepted' || c.status === 'granted') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          disabled={!!busy}
                          onClick={() => act(c.id, () => setConsentStatus(c.id, 'revoked'), 'Consent revoked')}
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>

        {/* Doctor directory */}
        <Card className="p-5 lg:col-span-3">
          <SectionTitle
            icon={UserPlus}
            title="Available doctors"
            hint={`${doctors.length} doctor${doctors.length === 1 ? '' : 's'} on CardioVisionAI`}
            right={
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search doctors" className="pl-9" />
              </div>
            }
          />
          {filteredDoctors.length === 0 ? (
            <EmptyState icon={Stethoscope} title="No doctors found" description="No doctor accounts match your search yet." />
          ) : (
            <div className="stagger grid gap-3 sm:grid-cols-2">
              {filteredDoctors.map((d) => {
                const link = linkByDoctor[d.id];
                const canRequest = !link || link.status === 'declined' || link.status === 'revoked';
                return (
                  <div key={d.id} className="lift group flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3.5">
                    <Avatar name={d.full_name} id={d.id} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display font-semibold">Dr. {d.full_name || 'Doctor'}</p>
                      <p className="text-xs text-muted-foreground">Retinal & cardiovascular screening</p>
                      {link && !canRequest && <div className="mt-1"><StatusPill status={link.status} /></div>}
                      {link?.status === 'declined' && <p className="mt-1 text-[11px] text-destructive">Previously declined</p>}
                    </div>
                    {canRequest && (
                      <Button
                        size="sm"
                        disabled={!!busy}
                        onClick={() => act(d.id, () => requestDoctor(user!.id, d.id, link), `Request sent to Dr. ${d.full_name}`)}
                      >
                        {busy === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="mr-1 h-4 w-4" />}
                        {busy === d.id ? '' : 'Request'}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
