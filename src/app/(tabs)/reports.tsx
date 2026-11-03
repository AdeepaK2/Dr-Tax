import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { getCategory } from '@/lib/categories';
import { formatDate } from '@/lib/dates';
import { listTxns } from '@/lib/db';
import { exportCsv } from '@/lib/exportCsv';
import { formatCents, formatCompact } from '@/lib/money';
import { isSameMonth, monthLabel, monthOf, monthRange, shiftMonth, useSelectedMonth, type Month } from '@/lib/period';
import { useLoader } from '@/lib/store';
import { summarize, type Summary } from '@/lib/summary';
import { filingDeadline, taxYearOf, type TaxYear } from '@/lib/taxYear';
import { Banner, Bar, Button, Card, Muted, Screen, SectionTitle } from '@/ui/components';
import { BankBreakdown, FlowTiles, GroupCards, MonthPicker, Segmented } from '@/ui/finance';
import { useColors } from '@/ui/theme';

type Mode = 'month' | 'year';

export default function Overview() {
  const [mode, setMode] = useState<Mode>('month');
  const [month, setMonth] = useSelectedMonth();

  return (
    <Screen title="Overview">
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'month', label: 'Month' },
          { value: 'year', label: 'Whole year' },
        ]}
      />
      {mode === 'month' ? (
        <MonthView month={month} onChange={setMonth} />
      ) : (
        <YearView
          month={month}
          onChange={setMonth}
          openMonth={(m) => {
            setMonth(m);
            setMode('month');
          }}
        />
      )}
      <Muted>
        Dr. Tax organises your records. It doesn’t work out your tax. Relief rules and limits change each year: check the Inland Revenue Department (ird.gov.lk) or a tax advisor before you file, and keep receipts for anything you claim.
      </Muted>
    </Screen>
  );
}

function useExport() {
  const [busy, setBusy] = useState(false);
  async function run(range: { start: number; end: number }, label: string) {
    setBusy(true);
    try {
      await exportCsv(range, label);
    } catch (e) {
      Alert.alert('Export failed', String(e));
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}

// ---------------- Month ----------------
function MonthView({ month, onChange }: { month: Month; onChange: (m: Month) => void }) {
  const range = monthRange(month);
  const prevRange = monthRange(shiftMonth(month, -1));
  const exp = useExport();
  const { data } = useLoader(async () => {
    const [cur, prev] = await Promise.all([
      listTxns({ from: range.start, to: range.end }, 100_000),
      listTxns({ from: prevRange.start, to: prevRange.end }, 100_000),
    ]);
    return { s: summarize(cur), prev: summarize(prev) };
  }, [range.start]);

  return (
    <>
      <MonthPicker month={month} onChange={onChange} />
      {data ? (
        <>
          <FlowTiles s={data.s} previous={data.prev.outCents > 0 ? data.prev : undefined} />
          {data.s.pendingCount > 0 ? (
            <Banner onPress={() => router.navigate('/review')}>
              {data.s.pendingCount} card charge{data.s.pendingCount === 1 ? ' is' : 's are'} still pending ({formatCents(data.s.pendingCents)}). Finalise in Review
            </Banner>
          ) : null}
          <GroupCards s={data.s} emptyText={`No payments in ${monthLabel(month)}.`} />
          <BankBreakdown s={data.s} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button label="See payments" kind="secondary" onPress={() => router.navigate('/transactions')} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Export month" kind="secondary" busy={exp.busy} onPress={() => exp.run(range, monthLabel(month))} />
            </View>
          </View>
        </>
      ) : null}
    </>
  );
}

// ---------------- Whole year (planner) ----------------
type MonthRow = { month: Month; s: Summary | null };

function YearView({ month, onChange, openMonth }: { month: Month; onChange: (m: Month) => void; openMonth: (m: Month) => void }) {
  const c = useColors();
  const ty: TaxYear = taxYearOf(monthRange(month).start);
  const exp = useExport();
  const [now] = useState(() => Date.now());

  const { data } = useLoader(async () => {
    const txns = await listTxns({ from: ty.start, to: ty.end }, 100_000);
    const rows: MonthRow[] = [];
    for (let i = 0; i < 12; i++) {
      const m = { year: ty.startYear + (3 + i >= 12 ? 1 : 0), month: (3 + i) % 12 };
      const r = monthRange(m);
      const inMonth = txns.filter((t) => t.occurred_at >= r.start && t.occurred_at < r.end);
      rows.push({ month: m, s: r.start > now ? null : summarize(inMonth) });
    }
    return { s: summarize(txns), rows };
  }, [ty.start]);

  const active = (data?.rows ?? []).filter((r) => r.s && (r.s.inCents > 0 || r.s.outCents > 0));
  const maxFlow = Math.max(1, ...active.flatMap((r) => [r.s!.inCents, r.s!.outCents]));
  const avgOut = active.length ? Math.round(active.reduce((sum, r) => sum + r.s!.outCents, 0) / active.length) : 0;
  const avgIn = active.length ? Math.round(active.reduce((sum, r) => sum + r.s!.inCents, 0) / active.length) : 0;
  const s = data?.s;
  const savingsRate = s && s.inCents > 0 ? Math.round(((s.inCents - s.outCents) / s.inCents) * 100) : null;
  const topSpend = s?.groups
    .filter((g) => g.group === 'personal' || g.group === 'business' || g.group === 'relief')
    .flatMap((g) => g.categories)
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 3);
  const current = monthOf(now);

  return (
    <>
      <MonthPicker
        month={month}
        onChange={(m) => onChange(shiftMonth(month, m.year * 12 + m.month > month.year * 12 + month.month ? 12 : -12))}
        label={`Tax year ${ty.label}`}
      />
      <Muted>
        1 Apr {ty.startYear} – 31 Mar {ty.startYear + 1} · return due {formatDate(filingDeadline(ty))}
      </Muted>

      {s ? <FlowTiles s={s} /> : null}

      {s && active.length > 0 ? (
        <Card style={{ gap: 6 }}>
          <PlanLine label="Average month" value={`+${formatCompact(avgIn)} / −${formatCompact(avgOut)}`} />
          {savingsRate != null ? <PlanLine label="Savings rate" value={`${savingsRate}% of money in`} /> : null}
          {topSpend?.length ? (
            <PlanLine label="Biggest spending" value={topSpend.map((t) => `${getCategory(t.category).short} ${formatCompact(t.cents)}`).join(' · ')} />
          ) : null}
          {s.unsortedCount > 0 ? <PlanLine label="Not sorted yet" value={`${s.unsortedCount} payment(s)`} warn /> : null}
        </Card>
      ) : null}

      <SectionTitle>Month by month</SectionTitle>
      <Card style={{ gap: 4, paddingVertical: 8 }}>
        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 4 }}>
          <Text style={{ color: c.text, fontSize: 12, fontWeight: '700' }}><Text style={{ color: c.inMark }}>●</Text> In</Text>
          <Text style={{ color: c.text, fontSize: 12, fontWeight: '700' }}><Text style={{ color: c.outMark }}>●</Text> Out</Text>
          <Text style={{ color: c.muted, fontSize: 12 }}>Tap a month to open it</Text>
        </View>
        {(data?.rows ?? []).map((r) => {
          const saved = r.s ? r.s.inCents - r.s.outCents : 0;
          const empty = !r.s || (r.s.inCents === 0 && r.s.outCents === 0);
          return (
            <Pressable
              key={`${r.month.year}-${r.month.month}`}
              disabled={!r.s}
              onPress={() => openMonth(r.month)}
              style={({ pressed }) => ({ paddingVertical: 8, gap: 4, opacity: pressed ? 0.6 : r.s ? 1 : 0.4 })}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={{ width: 92, color: c.text, fontWeight: isSameMonth(r.month, current) ? '800' : '600' }}>
                  {monthLabel(r.month).replace(/(\w{3})\w* (\d+)/, '$1 $2')}
                </Text>
                {empty ? (
                  <Text style={{ flex: 1, color: c.muted, fontSize: 12 }}>{r.s ? 'No payments' : 'Upcoming'}</Text>
                ) : (
                  <>
                    <Text style={{ flex: 1, color: c.muted, fontSize: 12, fontVariant: ['tabular-nums'] }}>
                      +{formatCompact(r.s!.inCents)} / −{formatCompact(r.s!.outCents)}
                    </Text>
                    <Text style={{ color: saved >= 0 ? c.primary : c.danger, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                      {saved >= 0 ? '+' : '−'}
                      {formatCompact(Math.abs(saved))}
                    </Text>
                  </>
                )}
              </View>
              {!empty ? (
                <View style={{ gap: 3 }}>
                  <Bar fraction={r.s!.inCents / maxFlow} color={c.inMark} />
                  <Bar fraction={r.s!.outCents / maxFlow} color={c.outMark} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </Card>

      {s ? (
        <>
          <SectionTitle>Tax summary for {ty.label}</SectionTitle>
          <GroupCards s={s} emptyText={`No payments recorded for ${ty.label}.`} />
          <SectionTitle>By bank</SectionTitle>
          <BankBreakdown s={s} />
          {s.foreignCount > 0 ? <Muted>{s.foreignCount} foreign-currency payment(s) are in the export but not in these totals.</Muted> : null}
        </>
      ) : null}
      <Button label={`Export ${ty.label} to CSV (Excel)`} busy={exp.busy} onPress={() => exp.run(ty, `tax year ${ty.label}`)} />
    </>
  );
}

function PlanLine({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Text style={{ width: 120, color: c.muted, fontSize: 13 }}>{label}</Text>
      <Text style={{ flex: 1, color: warn ? c.warn : c.text, fontSize: 13, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}
