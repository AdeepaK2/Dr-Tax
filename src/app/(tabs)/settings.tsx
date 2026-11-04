import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, Switch, Text, TextInput, View } from 'react-native';

import { isSmsReaderAvailable, listSenders, type SenderCount } from '../../../modules/sms-reader';
import { getCategory } from '@/lib/categories';
import { deleteRule, listRules, smsCounts, wipeAll } from '@/lib/db';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type AppSettings } from '@/lib/settings';
import { requestNotificationPermission } from '@/lib/notify';
import { notifyDataChanged, useLoader } from '@/lib/store';
import { hasSmsPermission, reapplyCategories, requestSmsPermission, rescanInbox } from '@/lib/sync';
import { BANKS } from '@/lib/types';
import { BackupSettings } from '@/ui/BackupSettings';
import { Button, Card, Chip, Muted, Screen, SectionTitle } from '@/ui/components';
import { useColors } from '@/ui/theme';

type SenderBank = keyof AppSettings['senders'];
const SENDER_BANKS: SenderBank[] = ['sampath', 'combank', 'peoples'];

const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

export default function Settings() {
  const c = useColors();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [senderText, setSenderText] = useState<Record<SenderBank, string>>({ sampath: '', combank: '', peoples: '' });
  const [namesText, setNamesText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [found, setFound] = useState<SenderCount[] | null>(null);

  const { data: extra } = useLoader(async () => {
    const [rules, counts, permitted] = await Promise.all([listRules(), smsCounts(), hasSmsPermission()]);
    return { rules, counts, permitted };
  }, []);

  function applyToForm(s: AppSettings) {
    setSettings(s);
    setSenderText({ sampath: s.senders.sampath.join(', '), combank: s.senders.combank.join(', '), peoples: s.senders.peoples.join(', ') });
    setNamesText(s.ownNames.join(', '));
  }

  useEffect(() => {
    loadSettings().then(applyToForm);
  }, []);

  async function save() {
    if (!settings) return;
    setBusy('save');
    try {
      const next: AppSettings = {
        ...settings,
        senders: { sampath: split(senderText.sampath), combank: split(senderText.combank), peoples: split(senderText.peoples) },
        ownNames: split(namesText),
      };
      await saveSettings(next);
      setSettings(next);
      const changed = await reapplyCategories();
      Alert.alert('Saved', changed ? `${changed} payment(s) re-categorised.` : 'Settings saved.');
    } finally {
      setBusy(null);
    }
  }

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Something went wrong', String(e));
    } finally {
      setBusy(null);
    }
  }

  const input = {
    backgroundColor: c.input,
    color: c.text,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: c.border,
  } as const;

  return (
    <Screen title="Settings">
      <SectionTitle>SMS access</SectionTitle>
      <Card style={{ gap: 8 }}>
        <Text style={{ color: c.text }}>
          {!isSmsReaderAvailable
            ? 'Not available in this build (Expo Go or iPhone). Install the Android build.'
            : extra?.permitted
              ? '✅ Allowed. Only messages from the senders below are read.'
              : '⚠️ Not allowed yet.'}
        </Text>
        {isSmsReaderAvailable && extra && !extra.permitted ? (
          <Button label="Allow SMS access" onPress={() =>
              run('perm', async () => {
                await requestSmsPermission();
                notifyDataChanged();
              })
            } />
        ) : null}
        {extra ? (
          <Muted>
            Imported {extra.counts.txn} payments, {extra.counts.cancel} cancellations. Skipped {extra.counts.otp} one-time codes and {extra.counts.alert} security alerts. {extra.counts.unknown} message(s) not understood.
          </Muted>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button label="View bank messages" kind="secondary" small onPress={() => router.push('/messages')} />
          <Button
            label="Re-scan whole inbox"
            kind="secondary"
            small
            busy={busy === 'rescan'}
            onPress={() =>
              run('rescan', async () => {
                const r = await rescanInbox();
                Alert.alert('Re-scan done', `${r.scanned} bank SMS checked, ${r.added} new payment(s) added.`);
              })
            }
          />
        </View>
      </Card>

      <SectionTitle>Bank sender IDs</SectionTitle>
      <Card style={{ gap: 10 }}>
        <Muted>The name shown as the sender in Messages. Separate several with commas.</Muted>
        {SENDER_BANKS.map((b) => (
          <View key={b} style={{ gap: 4 }}>
            <Text style={{ color: c.text, fontWeight: '600' }}>{BANKS[b].name}</Text>
            <TextInput
              value={senderText[b]}
              onChangeText={(v) => setSenderText({ ...senderText, [b]: v })}
              autoCapitalize="none"
              autoCorrect={false}
              style={input}
            />
          </View>
        ))}
        {isSmsReaderAvailable ? (
          <Button
            label="Find sender IDs on this phone"
            kind="secondary"
            small
            busy={busy === 'find'}
            onPress={() => run('find', async () => setFound(await listSenders(40)))}
          />
        ) : null}
        {found ? (
          <View style={{ gap: 6 }}>
            <Muted>Tap a sender to add it to a bank:</Muted>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {found.map((f) => (
                <Chip
                  key={f.address}
                  label={`${f.address} (${f.count})`}
                  onPress={() =>
                    Alert.alert(`Add "${f.address}"`, 'Which bank sends these messages?', [
                      ...SENDER_BANKS.map((b) => ({
                        text: BANKS[b].short,
                        onPress: () => setSenderText((t) => ({ ...t, [b]: [...split(t[b]), f.address].join(', ') })),
                      })),
                      { text: 'Cancel', style: 'cancel' as const },
                    ])
                  }
                />
              ))}
            </View>
          </View>
        ) : null}
      </Card>

      <SectionTitle>Your own names & accounts</SectionTitle>
      <Card style={{ gap: 8 }}>
        <Muted>Transfers to these are counted as moving your own money, not spending (e.g. “Adeepa”, an account number).</Muted>
        <TextInput value={namesText} onChangeText={setNamesText} autoCorrect={false} style={input} />
      </Card>

      <SectionTitle>Card charges</SectionTitle>
      <Card style={{ gap: 8 }}>
        <Muted>Confirm pending card charges automatically after this many days if the bank hasn’t cancelled them:</Muted>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {[0, 1, 3, 7, 14].map((d) => (
            <Chip
              key={d}
              label={d === 0 ? 'Never' : `${d} day${d === 1 ? '' : 's'}`}
              selected={settings?.autoConfirmDays === d}
              onPress={() => settings && setSettings({ ...settings, autoConfirmDays: d })}
            />
          ))}
        </View>
      </Card>

      <SectionTitle>Notifications</SectionTitle>
      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ flex: 1, color: c.text }}>Ask me what a payment was for when Dr. Tax can’t tell</Text>
          <Switch
            value={settings?.askWithNotifications ?? true}
            onValueChange={async (v) => {
              if (!settings) return;
              if (v && !(await requestNotificationPermission())) {
                Alert.alert('Notifications are off', 'Turn on notifications for Dr. Tax in Android Settings → Apps → Dr. Tax.');
                return;
              }
              setSettings({ ...settings, askWithNotifications: v });
            }}
          />
        </View>
        <Muted>You’ll get buttons like Freelance / Gift / Other… right in the notification. Also warns you about possible Uber double charges.</Muted>
      </Card>

      <Button label="Save settings" onPress={save} busy={busy === 'save'} />

      <SectionTitle>Your category rules</SectionTitle>
      <Card style={{ gap: 8 }}>
        {extra?.rules.length ? (
          extra.rules.map((r) => (
            <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, color: c.text }}>
                “{r.pattern}” → {getCategory(r.category).label}
              </Text>
              <Pressable
                hitSlop={8}
                onPress={() =>
                  run('rule', async () => {
                    await deleteRule(r.id);
                    await reapplyCategories();
                  })
                }>
                <Text style={{ color: c.danger }}>Remove</Text>
              </Pressable>
            </View>
          ))
        ) : (
          <Muted>None yet. When you change a payment’s category you can choose to always use it for that merchant.</Muted>
        )}
      </Card>

      <BackupSettings />

      <SectionTitle>Data</SectionTitle>
      <Card style={{ gap: 8 }}>
        <Muted>Your data lives on this phone and, if set up above, on your backup server. You can also export a month or year as CSV from the Overview tab.</Muted>
        <Button
          label="Delete all data"
          kind="danger"
          small
          onPress={() =>
            Alert.alert('Delete everything?', 'All imported payments, notes, categories and rules will be removed from this phone. Your SMS are not touched.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () =>
                  run('wipe', async () => {
                    await wipeAll();
                    await saveSettings(DEFAULT_SETTINGS);
                    applyToForm(DEFAULT_SETTINGS);
                    notifyDataChanged();
                  }),
              },
            ])
          }
        />
      </Card>
    </Screen>
  );
}
