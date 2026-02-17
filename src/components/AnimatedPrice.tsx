import { useEffect, useRef, useState } from 'react';

type Direction = 'up' | 'down';
type Phase = 'idle' | 'prepare' | 'run';

interface AnimatedPriceProps {
  value: number | null | undefined;
  className?: string;
}

export function AnimatedPrice({ value, className = '' }: AnimatedPriceProps) {
  const [displayValue, setDisplayValue] = useState<number | null>(() => (
    typeof value === 'number' && Number.isFinite(value) ? value : null
  ));
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [direction, setDirection] = useState<Direction>('up');
  const [phase, setPhase] = useState<Phase>('idle');
  const displayValueRef = useRef<number | null>(displayValue);
  const timeoutRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    displayValueRef.current = displayValue;
  }, [displayValue]);

  useEffect(() => {
    const nextValue = typeof value === 'number' && Number.isFinite(value) ? value : null;
    const currentValue = displayValueRef.current;

    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (rafRef.current != null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (nextValue == null) {
      setDisplayValue(null);
      setPreviousValue(null);
      setPhase('idle');
      displayValueRef.current = null;
      return;
    }

    if (currentValue == null) {
      setDisplayValue(nextValue);
      displayValueRef.current = nextValue;
      return;
    }

    if (nextValue === currentValue) return;

    setDirection(nextValue > currentValue ? 'up' : 'down');
    setPreviousValue(currentValue);
    setDisplayValue(nextValue);
    displayValueRef.current = nextValue;
    setPhase('prepare');

    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = window.requestAnimationFrame(() => {
        setPhase('run');
      });
    });

    timeoutRef.current = window.setTimeout(() => {
      setPreviousValue(null);
      setPhase('idle');
    }, 260);
  }, [value]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  const fmt = (n: number | null) => (n == null ? '—' : `$${n.toFixed(2)}`);

  const currentTransform = previousValue == null
    ? 'translateY(0%)'
    : (phase === 'run' ? 'translateY(0%)' : (direction === 'up' ? 'translateY(110%)' : 'translateY(-110%)'));

  const previousTransform = phase === 'run'
    ? (direction === 'up' ? 'translateY(-110%)' : 'translateY(110%)')
    : 'translateY(0%)';

  return (
    <span
      className={`relative inline-flex min-w-[8ch] overflow-hidden align-baseline tabular-nums ${className}`}
      aria-live="polite"
    >
      {previousValue != null && (
        <span
          className={`absolute left-0 top-0 transition-transform duration-300 ${phase === 'run' ? 'ease-out' : ''}`}
          style={{ transform: previousTransform }}
        >
          {fmt(previousValue)}
        </span>
      )}
      <span
        className="absolute left-0 top-0 transition-transform duration-300 ease-out"
        style={{ transform: currentTransform }}
      >
        {fmt(displayValue)}
      </span>
      <span className="invisible">{fmt(displayValue)}</span>
    </span>
  );
}
