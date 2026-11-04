/**
 * Sri Lanka's Year of Assessment (YoA) runs 1 April – 31 March.
 * A YoA is identified by the calendar year it starts in: 2026 → "2026/27".
 */
export type TaxYear = { startYear: number; label: string; start: number; end: number };

export function taxYearOf(ms: number): TaxYear {
  const d = new Date(ms);
  const startYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return taxYear(startYear);
}

export function taxYear(startYear: number): TaxYear {
  return {
    startYear,
    label: `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`,
    start: new Date(startYear, 3, 1).getTime(),
    // exclusive end: 1 April of the next year
    end: new Date(startYear + 1, 3, 1).getTime(),
  };
}

/** Return-filing deadline for a YoA: 30 November after it ends. */
export function filingDeadline(ty: TaxYear): number {
  return new Date(ty.startYear + 1, 10, 30).getTime();
}
