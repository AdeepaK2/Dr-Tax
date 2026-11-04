import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { BANK_CATALOG, bankInfo } from '@/lib/banks';
import { suggestAccounts, type AccountSuggestion, type DetectedBank } from '@/lib/detect';
import { newAccountId, type BankAccount } from '@/lib/settings';

import { Button, Card, Chip, Muted } from './components';
import { Icon, IconBadge } from './glass';
import { tint, useColors } from './theme';

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secure,
  keyboardType,
  autoCapitalize = 'sentences',
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secure?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  hint?: string;
}) {
  const c = useColors();
  const [shown, setShown] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.text, fontWeight: '700' }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.input, borderRadius: 16, borderWidth: 1, borderColor: c.border }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={c.muted}
          secureTextEntry={secure && !shown}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          style={{ flex: 1, color: c.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 }}
        />
        {secure ? (
          <Pressable onPress={() => setShown(!shown)} hitSlop={8} style={{ paddingHorizontal: 12 }}>
            <Icon name={shown ? 'visibility_off' : 'visibility'} size={20} color={c.muted} />
          </Pressable>
        ) : null}
      </View>
      {hint ? <Text style={{ color: c.muted, fontSize: 12 }}>{hint}</Text> : null}
    </View>
  );
}

/** Editable list of names, shown as chips. */
export function NamesInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const c = useColors();
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !value.some((x) => x.toUpperCase() === v.toUpperCase())) onChange([...value, v]);
    setDraft('');
  };
  return (
    <View style={{ gap: 8 }}>
      {value.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {value.map((n) => (
            <Pressable
              key={n}
              onPress={() => onChange(value.filter((x) => x !== n))}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: tint(c.primary, 0.14), borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 }}>
              <Text style={{ color: c.text, fontWeight: '600' }}>{n}</Text>
              <Icon name="close" size={14} color={c.muted} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          placeholder={placeholder}
          placeholderTextColor={c.muted}
          autoCorrect={false}
          style={{ flex: 1, backgroundColor: c.input, borderRadius: 14, borderWidth: 1, borderColor: c.border, color: c.text, paddingHorizontal: 14, paddingVertical: 10 }}
        />
        <Button label="Add" small kind="secondary" onPress={add} disabled={!draft.trim()} />
      </View>
    </View>
  );
}

const kindLabel = (k: BankAccount['kind']) => (k === 'card' ? 'Card' : 'Account');
const mask = (n: string) => (n.length > 4 ? `••${n.slice(-4)}` : n);

/**
 * Pick your banks and add their accounts/cards. Banks found in your SMS are shown first
 * (with message counts); account numbers seen in their SMS are offered as one-tap suggestions.
 */
export function BanksEditor({
  banks,
  accounts,
  detected,
  onChange,
}: {
  banks: string[];
  accounts: BankAccount[];
  detected: DetectedBank[];
  onChange: (next: { banks: string[]; accounts: BankAccount[] }) => void;
}) {
  const c = useColors();
  const [showAll, setShowAll] = useState(false);
  const detectedIds = detected.map((d) => d.bank.id);
  const order = [
    ...detected.map((d) => d.bank),
    ...BANK_CATALOG.filter((b) => !detectedIds.includes(b.id) && banks.includes(b.id)),
    ...BANK_CATALOG.filter((b) => !detectedIds.includes(b.id) && !banks.includes(b.id)),
  ];
  const visible = showAll ? order : order.filter((b) => detectedIds.includes(b.id) || banks.includes(b.id));

  const toggle = (id: string, on: boolean) =>
    onChange({
      banks: on ? [...banks, id] : banks.filter((b) => b !== id),
      accounts: on ? accounts : accounts.filter((a) => a.bank !== id),
    });

  return (
    <View style={{ gap: 10 }}>
      {visible.length === 0 ? <Muted>No bank SMS found yet. Pick your banks below.</Muted> : null}
      {visible.map((b) => {
        const d = detected.find((x) => x.bank.id === b.id);
        const on = banks.includes(b.id);
        return (
          <Card key={b.id} style={{ gap: 12, padding: 14 }}>
            <Pressable onPress={() => toggle(b.id, !on)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconBadge name="account_balance" color={b.color} size={38} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontWeight: '800', fontSize: 15 }}>{b.name}</Text>
                <Text style={{ color: d ? c.primaryDeep : c.muted, fontSize: 12 }}>
                  {d ? `Found in your SMS · ${d.count} message${d.count === 1 ? '' : 's'}` : b.template === 'generic' ? 'General SMS reader' : 'Exact SMS template'}
                </Text>
              </View>
              <Switch value={on} onValueChange={(v) => toggle(b.id, v)} />
            </Pressable>
            {on ? (
              <BankAccounts
                bankId={b.id}
                senders={d?.senders ?? []}
                accounts={accounts.filter((a) => a.bank === b.id)}
                onChange={(mine) => onChange({ banks, accounts: [...accounts.filter((a) => a.bank !== b.id), ...mine] })}
              />
            ) : null}
          </Card>
        );
      })}
      <Pressable onPress={() => setShowAll(!showAll)} style={{ paddingVertical: 8, alignItems: 'center' }}>
        <Text style={{ color: c.primaryDeep, fontWeight: '700' }}>{showAll ? 'Show fewer banks' : `Show all ${BANK_CATALOG.length} banks`}</Text>
      </Pressable>
    </View>
  );
}

function BankAccounts({
  bankId,
  senders,
  accounts,
  onChange,
}: {
  bankId: string;
  senders: string[];
  accounts: BankAccount[];
  onChange: (a: BankAccount[]) => void;
}) {
  const c = useColors();
  const [kind, setKind] = useState<BankAccount['kind']>('account');
  const [number, setNumber] = useState('');
  const [suggestions, setSuggestions] = useState<AccountSuggestion[]>([]);
  const sendersKey = senders.join('|');

  useEffect(() => {
    let alive = true;
    suggestAccounts(bankId, sendersKey ? sendersKey.split('|') : []).then((s) => alive && setSuggestions(s));
    return () => {
      alive = false;
    };
  }, [bankId, sendersKey]);

  const has = (k: BankAccount['kind'], n: string) => accounts.some((a) => a.kind === k && (a.number === n || a.number.endsWith(n) || n.endsWith(a.number)));
  const add = (k: BankAccount['kind'], n: string) => {
    const clean = n.replace(/\s/g, '');
    if (clean.length < 4 || has(k, clean)) return;
    onChange([...accounts, { id: newAccountId(), bank: bankId, kind: k, number: clean }]);
    setNumber('');
  };
  const fresh = suggestions.filter((s) => !has(s.kind, s.number));

  return (
    <View style={{ gap: 10, paddingLeft: 4 }}>
      {accounts.map((a) => (
        <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name={a.kind === 'card' ? 'credit_card' : 'savings'} size={18} color={c.primaryDeep} />
          <Text style={{ flex: 1, color: c.text, fontWeight: '600' }}>
            {kindLabel(a.kind)} {mask(a.number)}
          </Text>
          <Pressable hitSlop={8} onPress={() => onChange(accounts.filter((x) => x.id !== a.id))}>
            <Icon name="close" size={18} color={c.muted} />
          </Pressable>
        </View>
      ))}
      {fresh.length ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: c.muted, fontSize: 12 }}>Seen in {bankInfo(bankId).short} SMS. Tap to add:</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {fresh.map((s) => (
              <Chip key={`${s.kind}${s.number}`} label={`+ ${kindLabel(s.kind)} ${mask(s.number)} · ${s.count}`} onPress={() => add(s.kind, s.number)} />
            ))}
          </View>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        <Chip label="Account" selected={kind === 'account'} onPress={() => setKind('account')} />
        <Chip label="Card" selected={kind === 'card'} onPress={() => setKind('card')} />
        <TextInput
          value={number}
          onChangeText={setNumber}
          placeholder="Number or last 4"
          placeholderTextColor={c.muted}
          keyboardType="number-pad"
          style={{ flex: 1, backgroundColor: c.input, borderRadius: 12, borderWidth: 1, borderColor: c.border, color: c.text, paddingHorizontal: 10, paddingVertical: 8 }}
        />
        <Button label="Add" small kind="secondary" disabled={number.replace(/\D/g, '').length < 4} onPress={() => add(kind, number)} />
      </View>
    </View>
  );
}
