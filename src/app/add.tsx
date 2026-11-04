import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';

import { categoriesFor, TAX_GROUPS, getCategory } from '@/lib/categories';
import { parseUserDate } from '@/lib/dates';
import { insertTxn } from '@/lib/db';
import { parseAmountToCents } from '@/lib/money';
import { notifyDataChanged } from '@/lib/store';
import { BANKS, type BankId, type Direction } from '@/lib/types';
import { Button, Chip, Muted, Screen, SectionTitle } from '@/ui/components';
import { useMyBanks } from '@/lib/useMyBanks';
import { useColors } from '@/ui/theme';

function today() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export default function AddTxn() {
  const c = useColors();
  const myBanks = useMyBanks();
  const [direction, setDirection] = useState<Direction>('debit');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState(today());
  const [bank, setBank] = useState<BankId>('cash');
  const [category, setCategory] = useState('medical');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const input = { backgroundColor: c.input, color: c.text, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: c.border } as const;

  async function save() {
    const cents = parseAmountToCents(amount || '0');
    const at = parseUserDate(date);
    if (!(cents > 0)) return Alert.alert('Enter an amount');
    if (!merchant.trim()) return Alert.alert('Enter who you paid or who paid you');
    if (at == null) return Alert.alert('Date must look like 31/10/2026');
    setSaving(true);
    try {
      await insertTxn({
        sms_id: null,
        bank,
        account: null,
        direction,
        amount_cents: cents,
        currency: 'LKR',
        merchant: merchant.trim(),
        description: 'Added by hand',
        channel: 'manual',
        occurred_at: at,
        status: 'confirmed',
        category,
        category_locked: 1,
        reviewed: 1,
        flag: null,
        note: note.trim() || null,
      });
      notifyDataChanged();
      router.back();
    } finally {
      setSaving(false);
    }
  }

  const cats = categoriesFor(direction);

  return (
    <Screen underHeader subtitle="For cash payments or anything your bank didn’t SMS">
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="Money out" selected={direction === 'debit'} onPress={() => (setDirection('debit'), setCategory('medical'))} />
        <Chip label="Money in" selected={direction === 'credit'} onPress={() => (setDirection('credit'), setCategory('business_income'))} />
      </View>

      <TextInput value={amount} onChangeText={setAmount} placeholder="Amount (Rs)" placeholderTextColor={c.muted} keyboardType="decimal-pad" style={[input, { fontSize: 22, fontWeight: '700' }]} />
      <TextInput value={merchant} onChangeText={setMerchant} placeholder={direction === 'debit' ? 'Paid to (e.g. Asiri Hospital)' : 'Received from'} placeholderTextColor={c.muted} style={input} />
      <TextInput value={date} onChangeText={setDate} placeholder="dd/mm/yyyy" placeholderTextColor={c.muted} keyboardType="numbers-and-punctuation" style={input} />

      <SectionTitle>Paid with</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {myBanks.map((b) => (
          <Chip key={b} label={BANKS[b].short} selected={bank === b} color={BANKS[b].color} onPress={() => setBank(b)} />
        ))}
      </View>

      <SectionTitle>Category</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {cats.map((x) => (
          <Chip key={x.id} label={x.label} selected={category === x.id} color={TAX_GROUPS[x.group].color} dot onPress={() => setCategory(x.id)} />
        ))}
      </View>
      <Text style={{ color: c.muted, fontSize: 12 }}>Counts as: {TAX_GROUPS[getCategory(category).group].label}</Text>

      <TextInput value={note} onChangeText={setNote} placeholder="Note (receipt number, purpose…)" placeholderTextColor={c.muted} multiline style={[input, { minHeight: 60, textAlignVertical: 'top' }]} />
      <Button label="Save" onPress={save} busy={saving} />
      <Muted>Keep the receipt for anything you plan to claim as a relief.</Muted>
    </Screen>
  );
}
