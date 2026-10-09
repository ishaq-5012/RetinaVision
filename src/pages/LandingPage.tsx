import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ScanEye,
  Brain,
  Activity,
  ShieldCheck,
  FileText,
  Heart,
  ArrowRight,
  Microscope,
  Stethoscope,
  Sparkles,
  Aperture,
  Gauge,
  Upload,
  CheckCircle2,
  Zap,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Reveal } from '@/components/Reveal';
import { useCountUp, useInView } from '@/hooks/useMotion';
import { cn } from '@/lib/utils';
import { ScrollProgress } from '@/components/GlobalFX';
import { Magnetic, ParticleField, SplitText } from '@/components/fx';

/* ------------------------------------------------------------------ */
/* Retina illustration                                                 */
/* ------------------------------------------------------------------ */

// Vessel tree of a stylised right-eye fundus (optic disc on the right).
const VESSELS: { d: string; w: number; vein?: boolean }[] = [
  { d: 'M258,186 C225,140 170,100 100,96 C70,95 50,105 30,122', w: 5, vein: true },
  { d: 'M262,190 C230,150 180,122 110,120 C80,119 55,132 36,152', w: 3.4 },
  { d: 'M258,208 C225,258 170,300 100,305 C70,306 50,296 30,280', w: 5, vein: true },
  { d: 'M262,204 C230,245 180,276 110,280 C80,282 55,270 36,250', w: 3.4 },
  { d: 'M270,190 C300,170 330,150 372,140', w: 3 },
  { d: 'M272,200 C305,215 335,235 372,255', w: 3.6, vein: true },
  { d: 'M268,186 C285,150 300,110 320,58', w: 3.8, vein: true },
  { d: 'M268,210 C285,250 300,292 318,342', w: 3 },
  { d: 'M180,128 C170,160 165,180 150,196', w: 2 },
  { d: 'M175,272 C165,240 160,222 148,206', w: 2 },
  { d: 'M122,118 C112,90 106,70 100,44', w: 2.2 },
  { d: 'M118,281 C110,310 106,332 100,356', w: 2.2, vein: true },
  { d: 'M312,146 C322,118 336,100 352,92', w: 1.8 },
  { d: 'M312,240 C326,268 340,286 356,296', w: 1.8 },
  { d: 'M215,150 C205,175 200,188 188,200', w: 1.5 },
  { d: 'M70,100 C60,80 58,66 60,48', w: 1.6 },
];

function RetinaScanner({ className }: { className?: string }) {
  return (
    <div className={cn('relative aspect-square', className)}>
      {/* outer glow + orbit rings */}
      <div className="absolute inset-[-12%] rounded-full bg-[radial-gradient(circle,hsl(190_95%_50%/0.28),transparent_62%)] blur-2xl" />
      <div className="absolute inset-[-6%] rounded-full border border-cyan-300/15 animate-spin-slow" />
      <div className="absolute inset-[-12%] rounded-full border border-dashed border-violet-300/10 animate-spin-slow [animation-direction:reverse] [animation-duration:28s]" />

      <svg viewBox="0 0 400 400" className="relative h-full w-full drop-shadow-[0_0_40px_hsl(190_95%_50%/0.25)]">
        <defs>
          <radialGradient id="fundus" cx="45%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#f6ad62" />
            <stop offset="45%" stopColor="#d9672f" />
            <stop offset="80%" stopColor="#9b3317" />
            <stop offset="100%" stopColor="#4a120a" />
          </radialGradient>
          <radialGradient id="disc" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff6c9" />
            <stop offset="60%" stopColor="#f9d77e" />
            <stop offset="100%" stopColor="#e9a04a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="macula" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#5a160b" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#5a160b" stopOpacity="0" />
          </radialGradient>
          <clipPath id="eye">
            <circle cx="200" cy="200" r="185" />
          </clipPath>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g clipPath="url(#eye)">
          <circle cx="200" cy="200" r="185" fill="url(#fundus)" />
          <circle cx="158" cy="202" r="46" fill="url(#macula)" />
          <circle cx="264" cy="197" r="30" fill="url(#disc)" />
          {VESSELS.map((v, i) => (
            <path
              key={`v${i}`}
              d={v.d}
              fill="none"
              stroke={v.vein ? '#6d140f' : '#a52a1a'}
              strokeWidth={v.w}
              strokeLinecap="round"
              opacity={0.9}
            />
          ))}
          {/* AI-detected vessel overlay traces itself */}
          {VESSELS.map((v, i) => (
            <path
              key={`a${i}`}
              d={v.d}
              fill="none"
              stroke="hsl(188 100% 62%)"
              strokeWidth={Math.max(1.4, v.w * 0.55)}
              strokeLinecap="round"
              filter="url(#glow)"
              className="draw-path"
              style={{ ['--len' as string]: 420, ['--d' as string]: `${600 + i * 110}ms` }}
            />
          ))}
          {/* grid */}
          <g stroke="hsl(190 95% 70% / 0.12)" strokeWidth="0.6">
            {Array.from({ length: 9 }).map((_, i) => (
              <line key={`h${i}`} x1="0" x2="400" y1={40 + i * 40} y2={40 + i * 40} />
            ))}
            {Array.from({ length: 9 }).map((_, i) => (
              <line key={`c${i}`} y1="0" y2="400" x1={40 + i * 40} x2={40 + i * 40} />
            ))}
          </g>
        </g>
        <circle cx="200" cy="200" r="185" fill="none" stroke="hsl(190 95% 70% / 0.35)" strokeWidth="1.2" />
        {/* optic disc target */}
        <g className="animate-pulse">
          <circle cx="264" cy="197" r="34" fill="none" stroke="hsl(190 100% 70%)" strokeWidth="1.2" strokeDasharray="4 5" />
        </g>
      </svg>

      {/* rotating radar sweep */}
      <div className="pointer-events-none absolute inset-[3.75%] overflow-hidden rounded-full">
        <div className="scan-sweep absolute inset-0 rounded-full" />
      </div>
    </div>
  );
}

function FloatChip({ className, children, delay = 0 }: { className?: string; children: ReactNode; delay?: number }) {
  return (
    <div
      className={cn('enter-scale absolute z-10', className)}
      style={{ ['--enter-delay' as string]: `${delay}ms` }}
    >
      <div className="glass-dark animate-float rounded-2xl px-4 py-3" style={{ animationDelay: `${delay / 3}ms` }}>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

function useTypewriter(lines: string[], speed = 28, pause = 1800) {
  const [lineIdx, setLineIdx] = useState(0);
  const [text, setText] = useState('');
  useEffect(() => {
    const full = lines[lineIdx];
    if (text.length < full.length) {
      const id = window.setTimeout(() => setText(full.slice(0, text.length + 1)), speed);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => {
      setText('');
      setLineIdx((i) => (i + 1) % lines.length);
    }, pause);
    return () => window.clearTimeout(id);
  }, [text, lineIdx, lines, speed, pause]);
  return text;
}

function spotlight(e: MouseEvent<HTMLDivElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
}

function Tile({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div onMouseMove={spotlight} data-tilt="4" className={cn('tile p-6', className)}>
      {children}
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/5 px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
      {children}
    </div>
  );
}

function Stat({ value, suffix, label }: { value: number; suffix?: string; label: string }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const n = useCountUp(inView ? value : 0, 1500);
  return (
    <div ref={ref} className="text-center">
      <p className="font-display text-5xl font-extrabold tracking-tight text-fade-white sm:text-6xl">
        {Math.round(n)}
        {suffix && <span className="text-gradient-cyan">{suffix}</span>}
      </p>
      <p className="mt-2 text-sm text-slate-400">{label}</p>
    </div>
  );
}

const AI_LINES = [
  'The optic disc is visible with distinct margins and a central cup.',
  'Retinal vessels emerge from the disc and branch across the fundus.',
  'Appearance of mild tortuosity in the larger retinal vessels.',
  'Elevated blood pressure is relevant to retinal microvascular health.',
];

const TECH = ['OpenCV', 'scikit-image', 'Frangi vessel filter', 'FastAPI', 'Multimodal Vision AI', 'React', 'TypeScript', 'Supabase', 'Tailwind CSS'];

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function LandingPage() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const typed = useTypewriter(AI_LINES);
  const gauge = useCountUp(45, 1600);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const ctaTo = user ? '/home' : '/register';

  return (
    <div className="landing-dark min-h-screen overflow-x-hidden font-sans">
      <ScrollProgress />
      {/* ---------------- Nav ---------------- */}
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 transition-all duration-500',
          scrolled ? 'border-b border-white/5 bg-[hsl(222_47%_4%/0.7)] backdrop-blur-xl' : 'bg-transparent',
        )}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-[0_0_24px_hsl(190_95%_50%/0.5)]">
              <ScanEye className="h-5 w-5 text-white" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-white">CardioVisionAI</span>
          </Link>
          <nav className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1.5 backdrop-blur md:flex">
            {[
              ['#features', 'Platform'],
              ['#how-it-works', 'How it works'],
              ['#technology', 'Technology'],
              ['#research', 'Research'],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="rounded-full px-4 py-1.5 text-sm font-medium text-slate-300 transition-all duration-300 hover:bg-white/10 hover:text-white"
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {!user && (
              <Link to="/login" className="hidden rounded-full px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white sm:block">
                Sign in
              </Link>
            )}
            <Link
              to={ctaTo}
              className="btn-shine group inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900 shadow-[0_0_30px_hsl(0_0%_100%/0.25)] transition-transform duration-300 hover:scale-[1.03]"
            >
              {user ? 'Dashboard' : 'Get started'}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* ---------------- Hero ---------------- */}
      <section className="relative isolate overflow-hidden pt-32 sm:pt-36">
        <div className="aurora" />
        <div className="dot-grid absolute inset-0 -z-0" />
        <ParticleField className="opacity-70" />
        <div className="streak top-[38%]" />
        <div className="streak top-[52%] [animation-delay:-3s] opacity-40" />

        <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <a
              href="#technology"
              className="enter group mx-auto mb-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3 text-sm text-slate-300 backdrop-blur transition-colors hover:border-cyan-300/40"
            >
              <span className="rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 px-2.5 py-0.5 text-xs font-semibold text-white">New</span>
              Multimodal AI retinal interpretation
              <ChevronRight className="h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-0.5" />
            </a>
            <h1
              className="enter font-display text-5xl font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-6xl lg:text-7xl"
              style={{ ['--enter-delay' as string]: '80ms' }}
            >
              <SplitText text="See what your retina" wordClassName="text-fade-white" delay={150} />
              <br />
              <SplitText text="reveals about your heart." wordClassName="text-gradient-cyan" delay={450} />
            </h1>
            <p
              className="enter mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-400"
              style={{ ['--enter-delay' as string]: '160ms' }}
            >
              CardioVisionAI maps the vessel network in a single retinal photograph, fuses it with your clinical
              profile, and explains every finding in plain language — in seconds.
            </p>
            <div
              className="enter mt-9 flex flex-wrap items-center justify-center gap-3"
              style={{ ['--enter-delay' as string]: '240ms' }}
            >
              <Magnetic>
              <Link
                to={ctaTo}
                className="btn-shine group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-400 to-blue-600 px-7 py-3.5 text-sm font-semibold text-white shadow-[0_10px_40px_-8px_hsl(195_95%_50%/0.7)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_50px_-8px_hsl(195_95%_50%/0.85)]"
              >
                Start free screening
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              </Magnetic>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur transition-all duration-300 hover:border-white/30 hover:bg-white/10"
              >
                See how it works
              </a>
            </div>
            <div
              className="enter mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-500"
              style={{ ['--enter-delay' as string]: '320ms' }}
            >
              {['Results in seconds', 'Explainable vessel maps', 'Downloadable PDF report'].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-cyan-400" />
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Hero visual */}
          <div className="enter-scale relative mx-auto mt-16 max-w-5xl pb-24" style={{ ['--enter-delay' as string]: '350ms' }}>
            <div className="relative mx-auto w-[min(78vw,440px)]" data-tilt="10">
              <RetinaScanner />

              <FloatChip className="-left-4 top-6 lg:-left-44" delay={900}>
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Vessel density</p>
                <p className="font-display text-xl font-bold text-white">8.2%</p>
                <div className="mt-1.5 h-1 w-28 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-[62%] rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" />
                </div>
              </FloatChip>

              <FloatChip className="-right-4 top-16 lg:-right-48" delay={1150}>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/20">
                    <Activity className="h-4 w-4 text-violet-300" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Tortuosity</p>
                    <p className="font-display text-lg font-bold text-white">1.11</p>
                  </div>
                </div>
              </FloatChip>

              <FloatChip className="-left-6 bottom-10 hidden max-w-[240px] lg:-left-56 lg:block" delay={1400}>
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
                  <Sparkles className="h-3.5 w-3.5" /> AI observation
                </div>
                <p className="text-sm leading-snug text-slate-200">Optic disc visible with distinct margins and a central cup.</p>
              </FloatChip>

              <FloatChip className="-right-6 bottom-4 lg:-right-52" delay={1650}>
                <div className="flex items-center gap-3">
                  <div className="relative h-12 w-12">
                    <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
                      <circle cx="18" cy="18" r="15" fill="none" stroke="hsl(0 0% 100% / 0.1)" strokeWidth="3.5" />
                      <circle
                        cx="18"
                        cy="18"
                        r="15"
                        fill="none"
                        stroke="hsl(38 92% 55%)"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeDasharray={`${(gauge / 100) * 94.2} 94.2`}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
                      {Math.round(gauge)}
                    </span>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Risk score</p>
                    <p className="text-sm font-bold text-amber-300">Moderate</p>
                  </div>
                </div>
              </FloatChip>
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[hsl(222_47%_4%)]" />
      </section>

      {/* ---------------- Tech marquee ---------------- */}
      <section className="relative border-y border-white/5 py-8">
        <p className="mb-5 text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Built on a modern AI stack</p>
        <div className="marquee overflow-hidden">
          <div className="marquee-track gap-14 pr-14">
            {[...TECH, ...TECH].map((t, i) => (
              <span key={i} className="flex items-center gap-2 whitespace-nowrap font-display text-lg font-semibold text-slate-500 transition-colors hover:text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400/60" />
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Bento features ---------------- */}
      <Reveal as="section" id="features" className="mx-auto max-w-7xl px-5 py-28 sm:px-8">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <Eyebrow>
            <Layers className="h-3.5 w-3.5" /> Platform
          </Eyebrow>
          <h2 className="font-display text-4xl font-bold tracking-tight text-fade-white sm:text-5xl">
            <SplitText text="One photograph. A complete cardiovascular picture." step={45} wordClassName="text-fade-white" />
          </h2>
          <p className="mt-4 text-lg text-slate-400">
            Computer vision, clinical data and multimodal AI working together in one screening workflow.
          </p>
        </div>

        <div className="stagger grid auto-rows-[minmax(220px,auto)] gap-5 md:grid-cols-3">
          {/* Lead tile */}
          <Tile className="md:col-span-2 md:row-span-2">
            <div className="flex h-full flex-col gap-6 lg:flex-row lg:items-center">
              <div className="lg:w-1/2">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400/15">
                  <ScanEye className="h-5 w-5 text-cyan-300" />
                </div>
                <h3 className="font-display text-2xl font-bold text-white">Retinal vessel analysis</h3>
                <p className="mt-3 text-slate-400">
                  Multi-scale Frangi filtering segments the full vascular tree, then measures vessel density,
                  calibre, tortuosity and arteriovenous ratio on every scan.
                </p>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  {[
                    ['Density', '8.2%'],
                    ['Thickness', '0.22'],
                    ['Tortuosity', '1.11'],
                    ['AV ratio', '0.76'],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                      <p className="text-[11px] uppercase tracking-wider text-slate-500">{k}</p>
                      <p className="font-display text-lg font-bold text-white">{v}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative mx-auto w-full max-w-[300px] lg:w-1/2">
                <RetinaScanner />
              </div>
            </div>
          </Tile>

          {/* AI interpretation */}
          <Tile>
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-violet-400/15">
              <Sparkles className="h-5 w-5 text-violet-300" />
            </div>
            <h3 className="font-display text-xl font-bold text-white">Multimodal AI interpretation</h3>
            <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3.5 font-mono text-[13px] leading-relaxed text-slate-300">
              <span className="text-cyan-400">› </span>
              <span className="caret">{typed}</span>
            </div>
          </Tile>

          {/* Risk score */}
          <Tile>
            <div className="flex items-start justify-between">
              <div>
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-400/15">
                  <Gauge className="h-5 w-5 text-amber-300" />
                </div>
                <h3 className="font-display text-xl font-bold text-white">Cardiovascular risk score</h3>
                <p className="mt-2 text-sm text-slate-400">Retinal findings + clinical factors → 0–100 score.</p>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-2">
              {[
                ['Low', 'bg-emerald-400', 'w-[35%]'],
                ['Moderate', 'bg-amber-400', 'w-[30%]'],
                ['High', 'bg-rose-500', 'w-[35%]'],
              ].map(([l, c, w]) => (
                <div key={l} className={w}>
                  <div className={`h-2 rounded-full ${c} opacity-80`} />
                  <p className="mt-1.5 text-[11px] text-slate-500">{l}</p>
                </div>
              ))}
            </div>
          </Tile>

          {/* Image quality */}
          <Tile>
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-400/15">
              <Aperture className="h-5 w-5 text-emerald-300" />
            </div>
            <h3 className="font-display text-xl font-bold text-white">Automatic image quality</h3>
            <div className="mt-4 space-y-2.5">
              {[
                ['Sharpness', 82],
                ['Illumination', 68],
                ['Field coverage', 91],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <div className="mb-1 flex justify-between text-xs text-slate-400">
                    <span>{k}</span>
                    <span className="text-slate-300">{v}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400" style={{ width: `${v}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Tile>

          {/* Clinical factors */}
          <Tile>
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-rose-400/15">
              <Heart className="h-5 w-5 text-rose-300" />
            </div>
            <h3 className="font-display text-xl font-bold text-white">Clinical profile fusion</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {['Age', 'Blood pressure', 'Cholesterol', 'BMI', 'Smoking', 'Diabetes', 'Family history'].map((c) => (
                <span key={c} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300 transition-colors hover:border-rose-300/40 hover:text-white">
                  {c}
                </span>
              ))}
            </div>
          </Tile>

          {/* Report */}
          <Tile>
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-sky-400/15">
              <FileText className="h-5 w-5 text-sky-300" />
            </div>
            <h3 className="font-display text-xl font-bold text-white">Screening reports</h3>
            <p className="mt-2 text-sm text-slate-400">One-click PDF with images, biomarkers, score and AI findings.</p>
            <div className="absolute -bottom-8 right-5 w-32 rotate-6 rounded-lg border border-white/10 bg-white/90 p-2.5 shadow-2xl transition-transform duration-500 group-hover:rotate-0">
              <div className="mb-1.5 h-2 w-16 rounded bg-sky-600" />
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="mb-1 h-1 rounded bg-slate-300" style={{ width: `${90 - i * 12}%` }} />
              ))}
            </div>
          </Tile>

          {/* Dashboards */}
          <Tile>
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-400/15">
              <Stethoscope className="h-5 w-5 text-blue-300" />
            </div>
            <h3 className="font-display text-xl font-bold text-white">Patient & doctor dashboards</h3>
            <div className="mt-4 flex h-16 items-end gap-1.5">
              {[35, 55, 40, 70, 50, 82, 60, 74].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-gradient-to-t from-blue-600/40 to-cyan-400/80 transition-all duration-500 hover:to-cyan-300"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </Tile>
        </div>
      </Reveal>

      {/* ---------------- How it works ---------------- */}
      <Reveal as="section" id="how-it-works" className="relative border-y border-white/5 bg-white/[0.015] py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <Eyebrow>
              <Zap className="h-3.5 w-3.5" /> Workflow
            </Eyebrow>
            <h2 className="font-display text-4xl font-bold tracking-tight text-fade-white sm:text-5xl"><SplitText text="From retina to report in four steps" step={45} wordClassName="text-fade-white" /></h2>
          </div>
          <div className="relative">
            <div className="absolute left-0 right-0 top-7 hidden h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent lg:block" />
            <div className="stagger grid gap-10 md:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: Upload, title: 'Upload', desc: 'Drop in a retinal fundus photograph (JPG or PNG).' },
                { icon: Heart, title: 'Add clinical data', desc: 'Age, blood pressure, cholesterol, smoking, diabetes and more.' },
                { icon: Brain, title: 'Analyze', desc: 'Vessel segmentation, biomarkers and multimodal AI interpretation run in parallel.' },
                { icon: FileText, title: 'Review & report', desc: 'Risk score, vessel attention map, AI findings and a downloadable PDF.' },
              ].map((s, i) => (
                <div key={s.title} className="group relative text-center lg:text-left">
                  <div className="relative mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/25 bg-[hsl(222_47%_6%)] shadow-[0_0_30px_hsl(190_95%_50%/0.2)] transition-all duration-500 group-hover:scale-110 group-hover:border-cyan-300/60 group-hover:shadow-[0_0_40px_hsl(190_95%_50%/0.45)] lg:mx-0">
                    <s.icon className="h-6 w-6 text-cyan-300" />
                    <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-[11px] font-bold text-white">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="font-display text-xl font-bold text-white">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Reveal>

      {/* ---------------- Technology ---------------- */}
      <Reveal as="section" id="technology" className="mx-auto max-w-7xl px-5 py-28 sm:px-8">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <div>
            <Eyebrow>
              <Microscope className="h-3.5 w-3.5" /> Technology
            </Eyebrow>
            <h2 className="font-display text-4xl font-bold tracking-tight text-fade-white sm:text-5xl"><SplitText text="A dual-engine analysis pipeline" step={45} wordClassName="text-fade-white" /></h2>
            <p className="mt-5 text-lg leading-relaxed text-slate-400">
              Every scan runs through two engines side by side. Computer vision measures the retina with pixel
              precision; a vision-language model reads the image like a specialist would. Both are fused with the
              patient's clinical profile into one result.
            </p>
            <ul className="stagger mt-8 space-y-3">
              {[
                'CLAHE enhancement & automatic quality checks',
                'Frangi multi-scale vessel segmentation',
                'Skeleton-based tortuosity & calibre measurement',
                'Structured, explainable AI observations',
              ].map((t) => (
                <li key={t} className="flex items-center gap-3 text-slate-300">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-400/15">
                    <CheckCircle2 className="h-4 w-4 text-cyan-300" />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>

          {/* pipeline diagram */}
          <div className="glass-dark relative rounded-3xl p-6 sm:p-8">
            <div className="flex flex-col items-center gap-3">
              <PipeNode icon={ScanEye} title="Fundus image" sub="+ clinical profile" tone="from-slate-500 to-slate-700" />
              <Flow />
              <div className="grid w-full grid-cols-2 gap-3">
                <PipeNode icon={Aperture} title="Computer vision" sub="OpenCV · Frangi" tone="from-cyan-400 to-blue-600" />
                <PipeNode icon={Sparkles} title="Vision AI" sub="Multimodal model" tone="from-violet-400 to-fuchsia-600" />
              </div>
              <Flow />
              <PipeNode icon={Gauge} title="Fusion & scoring" sub="Retinal + clinical" tone="from-amber-400 to-orange-600" />
              <Flow />
              <PipeNode icon={ShieldCheck} title="Screening result" sub="Score · map · findings · PDF" tone="from-emerald-400 to-teal-600" />
            </div>
          </div>
        </div>
      </Reveal>

      {/* ---------------- Stats ---------------- */}
      <Reveal as="section" className="border-y border-white/5 py-20">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-10 px-5 sm:px-8 lg:grid-cols-4">
          <Stat value={5} label="Retinal biomarkers per scan" />
          <Stat value={4} label="Analysis engines" />
          <Stat value={6} label="Pipeline stages" />
          <Stat value={100} suffix="pt" label="Risk score scale" />
        </div>
      </Reveal>

      {/* ---------------- Research ---------------- */}
      <Reveal as="section" id="research" className="mx-auto max-w-4xl px-5 py-28 text-center sm:px-8">
        <Eyebrow>
          <Microscope className="h-3.5 w-3.5" /> Research
        </Eyebrow>
        <h2 className="font-display text-4xl font-bold tracking-tight text-fade-white sm:text-5xl">
          <SplitText text="The retina is a window to cardiovascular health" step={45} wordClassName="text-fade-white" />
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-400">
          Retinal vessels are the only blood vessels that can be photographed non-invasively. CardioVisionAI explores
          how changes in their density, calibre and tortuosity relate to cardiovascular risk factors — building on
          research with public retinal datasets such as UK Biobank and EyePACS.
        </p>
        <div className="stagger mt-12 grid gap-4 sm:grid-cols-3">
          {[
            { icon: ShieldCheck, title: 'Decision support', desc: 'Early risk awareness to guide a conversation with a clinician.' },
            { icon: Brain, title: 'Explainable', desc: 'Vessel attention maps and plain-language AI findings.' },
            { icon: Activity, title: 'Biomarker-driven', desc: 'Quantified density, calibre, tortuosity and AV ratio.' },
          ].map((r) => (
            <Tile key={r.title} className="text-left">
              <r.icon className="mb-4 h-6 w-6 text-cyan-300" />
              <h3 className="font-display text-lg font-bold text-white">{r.title}</h3>
              <p className="mt-1.5 text-sm text-slate-400">{r.desc}</p>
            </Tile>
          ))}
        </div>
      </Reveal>

      {/* ---------------- CTA ---------------- */}
      <Reveal as="section" className="mx-auto max-w-7xl px-5 pb-28 sm:px-8">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 px-8 py-20 text-center">
          <div className="aurora opacity-90" />
          <div className="dot-grid absolute inset-0" />
          <ParticleField className="opacity-60" density={0.00012} />
          <div className="relative">
            <h2 className="font-display text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
              Ready to look <span className="text-gradient-cyan">inside?</span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-slate-300">
              Create an account and run your first retinal cardiovascular screening in under a minute.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Magnetic>
              <Link
                to={ctaTo}
                className="btn-shine group inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-sm font-semibold text-slate-900 shadow-[0_0_40px_hsl(0_0%_100%/0.3)] transition-transform duration-300 hover:scale-[1.04]"
              >
                Get started free
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              </Magnetic>
              {!user && (
                <Link
                  to="/login"
                  className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-8 py-4 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/10"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </div>
      </Reveal>

      {/* ---------------- Footer ---------------- */}
      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-10 text-sm text-slate-500 sm:flex-row sm:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600">
              <ScanEye className="h-4 w-4 text-white" />
            </div>
            <span className="font-display font-semibold text-slate-300">CardioVisionAI</span>
          </div>
          <p>Retinal intelligence for cardiovascular risk awareness.</p>
          <p>© {new Date().getFullYear()} CardioVisionAI</p>
        </div>
      </footer>
    </div>
  );
}

function PipeNode({
  icon: Icon,
  title,
  sub,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub: string;
  tone: string;
}) {
  return (
    <div className="group flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 transition-all duration-300 hover:border-white/25 hover:bg-white/[0.06]">
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg transition-transform duration-300 group-hover:scale-110', tone)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="font-display text-sm font-bold text-white">{title}</p>
        <p className="truncate text-xs text-slate-400">{sub}</p>
      </div>
    </div>
  );
}

function Flow() {
  return (
    <svg width="2" height="26" className="overflow-visible">
      <line x1="1" y1="0" x2="1" y2="26" stroke="hsl(190 95% 60% / 0.25)" strokeWidth="2" />
      <line
        x1="1"
        y1="0"
        x2="1"
        y2="26"
        stroke="hsl(190 95% 65%)"
        strokeWidth="2"
        strokeDasharray="4 8"
        className="[animation:flowDash_1s_linear_infinite]"
      />
    </svg>
  );
}
