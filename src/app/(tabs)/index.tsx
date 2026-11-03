import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { isSmsReaderAvailable } from '../../../modules/sms-reader';
import { TAX_GROUPS } from '@/lib/categories';
import { formatDate, formatDateTime } from '@/lib/dates';
import { getSetting, listTxns, reviewCount } from '@/lib/db';
import { formatCompact } from '@/lib/money';
import { registerBackgroundSync } from '@/lib/backgroundSync';
import { requestNotificationPermission } from '@/lib/notify';
import { useLoader } from '@/lib/store';
import { summarize } from '@/lib/summary';
import { hasSmsPermission, requestSmsPermission, syncSms } from '@/lib/sync';
import { monthLabel, monthRange, shiftMonth, useSelectedMonth } from '@/lib/period';
import { filingDeadline, taxYearOf } from '@/lib/taxYear';
import { Banner, Button, Card, Muted, Screen, SectionTitle, Stat, TxnList } from '@/ui/components';
import { FlowTiles, MonthPicker } from '@/ui/finance';
import { Glass, Icon } from '@/ui/glass';
import { tint, useColors } from '@/ui/theme';
import type { AndroidSymbol } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';

export default function Home() {
  const c = useColors();
  const [month, setMonth] = useSelectedMonth();
  const range = monthRange(month);
  const prevRange = monthRange(shiftMonth(month, -1));
  const ty = taxYearOf(range.start);
  const [syncing, setSyncing] = useState(false);

  const { data } = useLoader(async () => {
    const [txns, prev, toReview, lastSync, permitted] = await Promise.all([
      listTxns({ from: range.start, to: range.end }, 100_000),
      listTxns({ from: prevRange.start, to: prevRange.end }, 100_000),
      reviewCount(),
      getSetting('last_sync_at'),
      hasSmsPermission(),
    ]);
    return { summary: summarize(txns), prev: summarize(prev), recent: txns.slice(0, 8), toReview, lastSync: lastSync ? Number(lastSync) : null, permitted };
  }, [range.start]);

  async function sync() {
    setSyncing(true);
    try {
      if (!(await hasSmsPermission())) {
        if (!(await requestSmsPermission())) {
          Alert.alert('Permission needed', 'Dr. Tax needs SMS access to read your bank messages. You can allow it in Android Settings → Apps → Dr. Tax → Permissions.');
          return;
        }
        await registerBackgroundSync();
        await requestNotificationPermission();
      }
      const r = await syncSms();
      const parts = [`${r.added} new transaction${r.added === 1 ? '' : 's'}`];
      if (r.cancelled) parts.push(`${r.cancelled} cancellation${r.cancelled === 1 ? '' : 's'} applied`);
      if (r.unsorted) parts.push(`${r.unsorted} to sort: tell Dr. Tax what they were for in Review`);
      if (r.holds) parts.push(`${r.holds} possible hold${r.holds === 1 ? '' : 's'} to check`);
      Alert.alert('Synced', parts.join('\n'));
    } catch (e) {
      Alert.alert('Sync failed', String(e));
    } finally {
      setSyncing(false);
    }
  }

  const s = data?.summary;

  return (
    <Screen title="Dr. Tax" subtitle={`Tax year ${ty.label} · return due ${formatDate(filingDeadline(ty))}`} refreshing={syncing} onRefresh={sync}>
      {!isSmsReaderAvailable ? (
        <Banner>
          SMS reading isn&apos;t available in this build. Install the Android build of Dr. Tax (not Expo Go) to import bank SMS. You can still add payments by hand.
        </Banner>
      ) : data && !data.permitted ? (
        <Card style={{ gap: 10 }}>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>Connect your bank SMS</Text>
          <Muted>
            Dr. Tax reads messages from Sampath, ComBank and People&apos;s Bank only, and keeps everything on this phone. One-time codes are never stored.
          </Muted>
          <Button label="Allow SMS access" onPress={sync} busy={syncing} />
        </Card>
      ) : null}

      {data && data.toReview > 0 ? (
        <Banner onPress={() => router.navigate('/review')}>
          {data.toReview} payment{data.toReview === 1 ? '' : 's'} need your answer: what they were for, pending card charges or possible Uber holds
        </Banner>
      ) : null}

      <MonthPicker month={month} onChange={setMonth} />
      {s ? <FlowTiles s={s} title={`Saved in ${monthLabel(month).split(' ')[0]}`} previous={data?.prev.outCents ? data.prev : undefined} /> : null}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat label="Taxable income" icon="payments" value={formatCompact(s?.incomeCents ?? 0)} color={TAX_GROUPS.income.color} hint="Salary, freelance, rent…" />
        <Stat label="Not taxable" icon="card_giftcard" value={formatCompact(s?.exemptCents ?? 0)} color={TAX_GROUPS.exempt.color} hint="Gifts, scholarships…" />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat label="Possible reliefs" icon="health_and_safety" value={formatCompact(s?.reliefCents ?? 0)} color={TAX_GROUPS.relief.color} hint="Medical, education…" />
        <Stat label="Work expenses" icon="work" value={formatCompact(s?.businessCents ?? 0)} color={TAX_GROUPS.business.color} hint="Freelance / business" />
      </View>
      {s && (s.unsortedCount > 0 || s.pendingCount > 0) ? (
        <Muted>
          {[
            s.unsortedCount ? `${s.unsortedCount} payment${s.unsortedCount === 1 ? '' : 's'} not sorted yet (not in the totals above)` : '',
            s.pendingCount ? `${formatCompact(s.pendingCents)} in ${s.pendingCount} card charge${s.pendingCount === 1 ? '' : 's'} still pending` : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </Muted>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <QuickAction icon="sync" label={syncing ? 'Syncing…' : 'Sync SMS'} onPress={sync} primary />
        <QuickAction icon="add" label="Add" onPress={() => router.push('/add')} />
        <QuickAction icon="fact_check" label={data?.toReview ? `Review ${data.toReview}` : 'Review'} onPress={() => router.navigate('/review')} />
      </View>
      <Muted>{data?.lastSync ? `Last synced ${formatDateTime(data.lastSync)}. Syncs automatically when you open the app and about every hour in the background.` : 'Not synced yet.'}</Muted>

      <SectionTitle right={<Text onPress={() => router.navigate('/reports')} style={{ color: c.primaryDeep, fontWeight: '700' }}>Whole year ›</Text>}>
        Latest in {monthLabel(month)}
      </SectionTitle>
      <TxnList txns={data?.recent ?? []} empty={`No payments in ${monthLabel(month)}.`} />
      {data && data.recent.length >= 8 ? <Button label="All payments this month" kind="secondary" onPress={() => router.navigate('/transactions')} /> : null}
    </Screen>
  );
}

/** Big square-ish button with an icon, for the main actions on Home. */
function QuickAction({ icon, label, onPress, primary }: { icon: AndroidSymbol; label: string; onPress: () => void; primary?: boolean }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.75 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      {primary ? (
        <LinearGradient colors={c.primaryGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 20, paddingVertical: 14, alignItems: 'center', gap: 6, boxShadow: '0px 8px 20px rgba(13,148,136,0.28)' }}>
          <Icon name={icon} size={24} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>{label}</Text>
        </LinearGradient>
      ) : (
        <Glass radius={20} style={{ paddingVertical: 14, alignItems: 'center', gap: 6 }}>
          <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(c.primary, 0.14) }}>
            <Icon name={icon} size={20} color={c.primaryDeep} />
          </View>
          <Text style={{ color: c.text, fontWeight: '700', fontSize: 13 }}>{label}</Text>
        </Glass>
      )}
    </Pressable>
  );
}
