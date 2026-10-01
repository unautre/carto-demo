import type { Duration, TimeUnit } from './types';

export const UNIT_MS: Record<TimeUnit, number> = {
  ms: 1,
  seconds: 1000,
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
};

export const UNIT_ORDER: TimeUnit[] = ['ms', 'seconds', 'minutes', 'hours', 'days'];

export const UNIT_LABEL: Record<TimeUnit, string> = {
  ms: 'ms',
  seconds: 'sec',
  minutes: 'min',
  hours: 'hr',
  days: 'days',
};

export function durationMs(d: Duration): number {
  return d.value * UNIT_MS[d.unit];
}

export function isValidDuration(d: unknown): d is Duration {
  const c = d as Partial<Duration> | undefined;
  return !!c && typeof c.value === 'number' && Number.isFinite(c.value) && c.value > 0 && typeof c.unit === 'string' && UNIT_ORDER.includes(c.unit as TimeUnit);
}
