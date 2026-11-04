import { useSyncExternalStore } from 'react';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A calendar month: year + month index (0 = January). */
export type Month = { year: number; month: number };

export function monthOf(ms: number): Month {
  const d = new Date(ms);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export function shiftMonth(m: Month, by: number): Month {
  const d = new Date(m.year, m.month + by, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export function monthRange(m: Month): { start: number; end: number } {
  return { start: new Date(m.year, m.month, 1).getTime(), end: new Date(m.year, m.month + 1, 1).getTime() };
}

export function monthLabel(m: Month): string {
  return `${MONTHS[m.month]} ${m.year}`;
}

export function isSameMonth(a: Month, b: Month): boolean {
  return a.year === b.year && a.month === b.month;
}

// ---- The month you're looking at, shared by Home, Payments and Overview ----
let selected: Month = monthOf(Date.now());
const listeners = new Set<() => void>();

export function setSelectedMonth(m: Month) {
  selected = m;
  listeners.forEach((l) => l());
}

export function useSelectedMonth(): [Month, (m: Month) => void] {
  const m = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => selected,
  );
  return [m, setSelectedMonth];
}
