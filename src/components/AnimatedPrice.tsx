import { useEffect, useMemo, useRef, useState } from 'react';

type Direction = 'up' | 'down';
type Phase = 'idle' | 'prepare' | 'run';

interface AnimatedPriceProps {
  value: number | null | undefined;
  className?: string;
}

type PriceSlot = {
  current: string;
  previous: string | null;
  changed: boolean;
};

function buildSlots(currentText: string, previousText: string | null): PriceSlot[] {
  const [currInt, currDec = '00'] = currentText.split('.');
  const [prevIntRaw = '', prevDec = ''] = (previousText ?? '').split('.');
  const intLen = Math.max(currInt.length, prevIntRaw.length);

  const currPadded = `${currInt.padStart(intLen, ' ')}.${currDec}`;
  const prevPadded = previousText ? `${prevIntRaw.padStart(intLen, ' ')}.${prevDec.padEnd(2, '0')}` : null;

  return currPadded.split('').map((char, idx) => {
    const prev = prevPadded ? prevPadded[idx] ?? null : null;
    const isDigitLike = char !== '.';
    const changed = !!prevPadded && isDigitLike && prev !== char;
    return { current: char, previous: prev, changed };
  });
}

export function AnimatedPrice({ value, className = '' }: AnimatedPriceProps) {
  const [displayValue, setDisplayValue] = useState<number | null>(() => (
    typeof value === 'number' && Number.isFinite(value) ? value : null
  ));
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [direction, setDirection] = useState<Direction>('up');
  const [phase, setPhase] = useState<Phase>('idle');
  const displayRef = useRef<number | null>(displayValue);
  const timeoutRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    displayRef.current = displayValue;
  }, [displayValue]);

  useEffect(() => {
    const nextValue = typeof value === 'number' && Number.isFinite(value) ? value : null;
    const currentValue = displayRef.current;

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
      displayRef.current = null;
      return;
    }

    if (currentValue == null) {
      setDisplayValue(nextValue);
      displayRef.current = nextValue;
      return;
    }

    if (nextValue === currentValue) return;

    setDirection(nextValue > currentValue ? 'up' : 'down');
    setPreviousValue(currentValue);
    setDisplayValue(nextValue);
    displayRef.current = nextValue;
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

  const currentText = useMemo(
    () => (displayValue == null ? '—' : displayValue.toFixed(2)),
    [displayValue]
  );
  const previousText = useMemo(
    () => (previousValue == null ? null : previousValue.toFixed(2)),
    [previousValue]
  );
  const slots = useMemo(
    () => (currentText === '—' ? [{ current: '—', previous: null, changed: false }] : buildSlots(currentText, previousText)),
    [currentText, previousText]
  );

  const enteringStart = direction === 'up' ? 'translateY(110%)' : 'translateY(-110%)';
  const leavingEnd = direction === 'up' ? 'translateY(-110%)' : 'translateY(110%)';

  return (
    <span className={`inline-flex items-baseline tabular-nums ${className}`} aria-live="polite">
      {currentText === '—' ? (
        <span>—</span>
      ) : (
        <>
          <span className="mr-[0.1em]">$</span>
          {slots.map((slot, idx) => {
            if (slot.current === '.') {
              return (
                <span key={`dot-${idx}`} className="w-[0.55ch] text-center">
                  .
                </span>
              );
            }

            const currChar = slot.current === ' ' ? '\u00A0' : slot.current;
            const prevChar = slot.previous == null || slot.previous === ' ' ? '\u00A0' : slot.previous;

            if (!slot.changed || previousValue == null) {
              return (
                <span key={`stable-${idx}`} className="inline-flex w-[0.82ch] justify-center">
                  {currChar}
                </span>
              );
            }

            const currentTransform = phase === 'run' ? 'translateY(0%)' : enteringStart;
            const previousTransform = phase === 'run' ? leavingEnd : 'translateY(0%)';

            return (
              <span key={`anim-${idx}`} className="relative inline-flex h-[1em] w-[0.82ch] justify-center overflow-hidden">
                <span
                  className="absolute left-0 top-0 inline-flex w-full justify-center transition-transform duration-300 ease-out"
                  style={{ transform: previousTransform }}
                >
                  {prevChar}
                </span>
                <span
                  className="absolute left-0 top-0 inline-flex w-full justify-center transition-transform duration-300 ease-out"
                  style={{ transform: currentTransform }}
                >
                  {currChar}
                </span>
                <span className="invisible">{currChar}</span>
              </span>
            );
          })}
        </>
      )}
    </span>
  );
}
