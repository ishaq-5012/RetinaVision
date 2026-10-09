import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const finePointer = () => window.matchMedia?.('(pointer: fine)').matches;

/**
 * App-wide interaction effects:
 *  - glowing route-change progress bar
 *  - soft cursor glow (mouse devices only)
 *  - cursor spotlight on any element with the `spot` class (sets --mx/--my)
 *  - 3D tilt on elements with `data-tilt` (optional strength value)
 *  - click ripple on buttons and `.ripple` elements
 */
export function GlobalFX() {
  const location = useLocation();
  const [routeKey, setRouteKey] = useState(0);
  const glowRef = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  // Route progress bar: restart on every navigation (skip first paint)
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setRouteKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname]);

  useEffect(() => {
    if (reduceMotion()) return;
    let tiltEl: HTMLElement | null = null;
    let frame = 0;

    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // cursor glow
        if (glowRef.current) {
          glowRef.current.style.transform = `translate3d(${e.clientX - 300}px, ${e.clientY - 300}px, 0)`;
          glowRef.current.style.opacity = '1';
        }
        const target = e.target as Element | null;
        // spotlight
        const spot = target?.closest?.('.spot') as HTMLElement | null;
        if (spot) {
          const r = spot.getBoundingClientRect();
          spot.style.setProperty('--mx', `${e.clientX - r.left}px`);
          spot.style.setProperty('--my', `${e.clientY - r.top}px`);
        }
        // tilt
        const t = target?.closest?.('[data-tilt]') as HTMLElement | null;
        if (tiltEl && tiltEl !== t) {
          tiltEl.style.transform = '';
          tiltEl = null;
        }
        if (t) {
          const strength = Number(t.dataset.tilt) || 6;
          const r = t.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width - 0.5;
          const py = (e.clientY - r.top) / r.height - 0.5;
          t.style.transform = `perspective(900px) rotateX(${(-py * strength).toFixed(2)}deg) rotateY(${(px * strength).toFixed(2)}deg) translateY(-3px)`;
          tiltEl = t;
        }
      });
    };
    const onLeave = () => {
      if (glowRef.current) glowRef.current.style.opacity = '0';
      if (tiltEl) tiltEl.style.transform = '';
      tiltEl = null;
    };
    const onDown = (e: PointerEvent) => {
      const host = (e.target as Element | null)?.closest?.('button, .ripple, a[class*="rounded-full"]') as HTMLElement | null;
      if (!host || host.hasAttribute('disabled')) return;
      const r = host.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 2;
      const span = document.createElement('span');
      span.className = 'ripple-ink';
      span.style.width = span.style.height = `${size}px`;
      span.style.left = `${e.clientX - r.left - size / 2}px`;
      span.style.top = `${e.clientY - r.top - size / 2}px`;
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      host.style.overflow = 'hidden';
      host.appendChild(span);
      window.setTimeout(() => span.remove(), 650);
    };

    if (finePointer()) {
      window.addEventListener('pointermove', onMove, { passive: true });
      document.documentElement.addEventListener('pointerleave', onLeave);
    }
    window.addEventListener('pointerdown', onDown, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('pointerdown', onDown);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      {routeKey > 0 && <div key={routeKey} className="route-bar" />}
      <div ref={glowRef} className="cursor-glow" aria-hidden />
    </>
  );
}

/** Thin bar at the top that tracks page scroll progress. */
export function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (ref.current) ref.current.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return <div ref={ref} className="scroll-progress" aria-hidden />;
}
