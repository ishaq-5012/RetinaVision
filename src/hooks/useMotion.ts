import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Animates a number from 0 (or its previous value) to `target` with an ease-out curve. */
export function useCountUp(target: number, duration = 1100, decimals = 0) {
  const [value, setValue] = useState(prefersReducedMotion() ? target : 0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion() || !Number.isFinite(target)) {
      setValue(target);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (target - from) * eased;
      setValue(Number(next.toFixed(decimals)));
      if (t < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, decimals]);

  return value;
}

/** True once the element has scrolled into view (stays true). */
// threshold 0 + negative bottom margin: fires once the element's top is ~8% into the viewport,
// which also works for sections taller than the screen.
export function useInView<T extends Element>(
  options: IntersectionObserverInit = { threshold: 0, rootMargin: '0px 0px -8% 0px' },
) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        observer.disconnect();
      }
    }, options);
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView]);

  return { ref, inView };
}

/** False on the first paint, true right after — lets CSS transitions animate from an initial state. */
export function useMounted(delay = 60) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), delay);
    return () => window.clearTimeout(id);
  }, [delay]);
  return mounted;
}

// Cards mounted in the same frame get increasing delays so they cascade in.
let enterSeq = 0;
let resetQueued = false;
export function nextEnterDelay(step = 70, max = 8) {
  const d = Math.min(enterSeq++, max) * step;
  if (!resetQueued) {
    resetQueued = true;
    requestAnimationFrame(() => {
      enterSeq = 0;
      resetQueued = false;
    });
  }
  return d;
}
