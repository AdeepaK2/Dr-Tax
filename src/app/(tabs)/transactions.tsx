import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatMonth } from '@/lib/dates';
import { listTxns } from '@/lib/db';
import { formatCents } from '@/lib/money';
import { useLoader } from '@/lib/store';
import { monthRange, useSelectedMonth } from '@/lib/period';
import { BANKS, COUNTED_STATUSES, type BankId, type Txn, type TxnStatus } from '@/lib/types';
import { Chip, TxnRow } from '@/ui/components';
import { MonthPicker } from '@/ui/finance';
import { Backdrop, Glass, StatusBarGlass } from '@/ui/glass';
import { useMyBanks } from '@/lib/useMyBanks';
import { useColors } from '@/ui/theme';

type Row = { type: 'header'; key: string; label: string; outCents: number } | { type: 'txn'; key: string; txn: Txn };

export default function Transactions() {
  const c = useColors();
  const myBanks = useMyBanks();
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useSelectedMonth();
  const [bank, setBank] = useState<BankId | undefined>();
  const [status, setStatus] = useState<TxnStatus | undefined>();
  const [search, setSearch] = useState('');
  const range = monthRange(month);

  const { data: txns } = useLoader(
    () =>
      // Searching looks across all months; otherwise show the selected month.
      search.trim()
        ? listTxns({ bank, status, search: search.trim() }, 5000)
        : listTxns({ from: range.start, to: range.end, bank, status }, 5000),
    [range.start, bank, status, search],
  );

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let current: Extract<Row, { type: 'header' }> | null = null;
    for (const t of txns ?? []) {
      const label = formatMonth(t.occurred_at);
      if (!current || current.label !== label) {
        current = { type: 'header', key: `h-${label}`, label, outCents: 0 };
        out.push(current);
      }
      if (t.direction === 'debit' && COUNTED_STATUSES.includes(t.status) && t.currency === 'LKR' && t.category !== 'transfer_self') {
        current.outCents += t.amount_cents;
      }
      out.push({ type: 'txn', key: String(t.id), txn: t });
    }
    return out;
  }, [txns]);

  const header = (
    <View style={{ gap: 10, paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flex: 1, fontSize: 32, fontWeight: '800', color: c.text, letterSpacing: -0.8 }}>Payments</Text>
        <Pressable onPress={() => router.push('/add')} hitSlop={10}>
          <Text style={{ color: c.primary, fontWeight: '700', fontSize: 16 }}>+ Add</Text>
        </Pressable>
      </View>

      <MonthPicker month={month} onChange={setMonth} />

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search all months: merchant, payee or note"
        placeholderTextColor={c.muted}
        style={{ backgroundColor: c.input, color: c.text, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: c.border }}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label="All banks" selected={!bank} onPress={() => setBank(undefined)} />
        {myBanks.map((b) => (
          <Chip key={b} label={BANKS[b].short} selected={bank === b} color={BANKS[b].color} onPress={() => setBank(bank === b ? undefined : b)} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label="Any status" selected={!status} onPress={() => setStatus(undefined)} />
        {(['pending', 'confirmed', 'cancelled', 'hold', 'excluded'] as TxnStatus[]).map((s) => (
          <Chip key={s} label={s === 'hold' ? 'Holds' : s[0].toUpperCase() + s.slice(1)} selected={status === s} onPress={() => setStatus(status === s ? undefined : s)} />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
    <Backdrop />
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 100, paddingHorizontal: 16 }}
      data={rows}
      keyExtractor={(r) => r.key}
      ListHeaderComponent={header}
      ListEmptyComponent={<Text style={{ color: c.muted, textAlign: 'center', marginTop: 32 }}>No payments match.</Text>}
      renderItem={({ item }) =>
        item.type === 'header' ? (
          <View style={{ flexDirection: 'row', marginTop: 14, marginBottom: 2 }}>
            <Text style={{ flex: 1, color: c.muted, fontWeight: '700', fontSize: 13 }}>{item.label.toUpperCase()}</Text>
            <Text style={{ color: c.muted, fontSize: 13 }}>spent {formatCents(item.outCents)}</Text>
          </View>
        ) : (
          <Glass radius={18} style={{ paddingHorizontal: 12, marginTop: 8 }}>
            <TxnRow txn={item.txn} last />
          </Glass>
        )
      }
    />
    <StatusBarGlass />
    </View>
  );
}
