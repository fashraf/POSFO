import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

export interface TypewriterProps {
  /** Phrases cycled through, in order. */
  phrases: string[];
  typeSpeedMs?: number;
  deleteSpeedMs?: number;
  /** How long a completed phrase rests before deleting. */
  holdMs?: number;
  className?: string;
}

/**
 * Types each phrase, holds it, deletes it, moves on.
 *
 * Reduced-motion is respected by falling back to a plain rotation with no
 * character animation — the information still cycles, it just does not move.
 */
export function Typewriter({
  phrases,
  typeSpeedMs = 55,
  deleteSpeedMs = 28,
  holdMs = 1600,
  className,
}: TypewriterProps) {
  const [index, setIndex] = useState(0);
  const [text, setText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);

    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (phrases.length === 0) return;

    if (reduced) {
      setText(phrases[index]);
      const timer = window.setTimeout(
        () => setIndex((current) => (current + 1) % phrases.length),
        holdMs + 1200,
      );
      return () => window.clearTimeout(timer);
    }

    const phrase = phrases[index];

    /* Finished typing: rest, then start deleting. */
    if (!deleting && text === phrase) {
      const timer = window.setTimeout(() => setDeleting(true), holdMs);
      return () => window.clearTimeout(timer);
    }

    /* Finished deleting: advance to the next phrase. */
    if (deleting && text === '') {
      setDeleting(false);
      setIndex((current) => (current + 1) % phrases.length);
      return;
    }

    const timer = window.setTimeout(
      () => {
        setText((current) =>
          deleting ? phrase.slice(0, current.length - 1) : phrase.slice(0, current.length + 1),
        );
      },
      deleting ? deleteSpeedMs : typeSpeedMs,
    );

    return () => window.clearTimeout(timer);
  }, [text, deleting, index, phrases, reduced, typeSpeedMs, deleteSpeedMs, holdMs]);

  return (
    <span className={cn('inline-flex items-center', className)}>
      <span>{text}</span>
      {!reduced && (
        <span
          aria-hidden
          className="ms-0.5 inline-block h-[1.1em] w-[2px] animate-pulse bg-brand-500"
        />
      )}
    </span>
  );
}
