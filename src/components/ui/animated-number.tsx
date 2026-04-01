'use client';

import { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  duration?: number; // ms
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
  formatter?: (n: number) => string;
}

/**
 * Counts up from 0 to `value` over `duration` milliseconds using requestAnimationFrame.
 * Replays whenever `value` changes.
 */
export function AnimatedNumber({
  value,
  duration = 800,
  prefix = '',
  suffix = '',
  decimals = 0,
  className,
  formatter,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const prevValueRef = useRef(0);

  useEffect(() => {
    const from = prevValueRef.current;
    const to = value;
    prevValueRef.current = to;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    startRef.current = null;

    const step = (timestamp: number) => {
      if (!startRef.current) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (to - from) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setDisplay(to);
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value, duration]);

  const formatted = formatter
    ? formatter(display)
    : `${prefix}${display.toFixed(decimals)}${suffix}`;

  return <span className={className}>{formatted}</span>;
}
