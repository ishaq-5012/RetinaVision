import { type ReactNode } from 'react';
import { useInView } from '@/hooks/useMotion';
import { cn } from '@/lib/utils';

/** Fades and slides its children in when they scroll into view. */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = 'div',
  id,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li';
  id?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <Tag
      id={id}
      ref={ref as never}
      className={cn('reveal', inView && 'is-visible', className)}
      style={{ ['--reveal-delay' as string]: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}
