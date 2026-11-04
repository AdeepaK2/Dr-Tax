import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';

import { isSmsReaderAvailable } from '../../../modules/sms-reader';
import { backToWelcome } from '@/lib/appState';
import { signOut, useSession } from '@/lib/auth';
import { bankInfo } from '@/lib/banks';
import { getCategory } from '@/lib/categories';
import { deleteRule, listRules, smsCounts, wipeAll } from '@/lib/db';
import { requestNotificationPermission } from '@/lib/notify';
import { loadSettings, saveSettings, type AppSettings } from '@/lib/settings';
import { notifyDataChanged, useLoader } from '@/lib/store';
import { hasSmsPermission, reapplyCategories, requestSmsPermission, rescanInbox } from '@/lib/sync';
import { BackupSettings } from '@/ui/BackupSettings';
import { Button, Card, Chip, Muted, Screen, SectionTitle } from '@/ui/components';
import { tint, useColors } from '@/ui/theme';

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?'
  );
}

export default function Settings() {
  const c = useColors();
  const session = useSession();
  // Your latest change wins over what was loaded.
  const [edited, setEdited] = useState<AppSettings | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: extra } = useLoader(async () => {
    const [rules, counts, permitted, s] = await Promise.all([listRules(), smsCounts(), hasSmsPermission(), loadSettings()]);
    return { rules, counts, permitted, s };
  }, []);

  const settings = edited ?? extra?.s ?? null;

  async function update(patch: Partial<AppSettings>) {
    const next = { ...(await loadSettings()), ...patch };
    await saveSettings(next);
    setEdited(next);
  }

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Something went wrong', (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function clearPhone() {
    await wipeAll();
    await signOut();
    notifyDataChanged();
    backToWelcome();
  }

  function confirmSignOut() {
    Alert.alert('Sign out?', 'Backups stop while you’re signed out.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', onPress: () => run('signout', signOut) },
      {
        text: 'Sign out & clear this phone',
        style: 'destructive',
        onPress: () => run('signout', clearPhone),
      },
    ]);
  }

  const name = settings?.profile.name || session?.user.name || '';
  const banks = settings?.banks ?? [];

  return (
    <Screen title="Settings">
      <SectionTitle>Account</SectionTitle>
      <Card strong style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(c.primary, 0.18), borderWidth: 1, borderColor: tint(c.primary, 0.35) }}>
            <Text style={{ color: c.primaryDeep, fontSize: 20, fontWeight: '800' }}>{initials(name)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: 18, fontWeight: '800' }}>{name || 'Your profile'}</Text>
            <Text style={{ color: c.muted }}>{session ? session.user.email : 'Not signed in · data on this phone only'}</Text>
          </View>
        </View>
        <Text style={{ color: c.textSecondary, fontSize: 13 }}>
          {banks.length ? `Banks: ${banks.map((b) => bankInfo(b).short).join(', ')}` : 'No banks added yet.'}
          {settings?.accounts.length ? ` · ${settings.accounts.length} account${settings.accounts.length === 1 ? '' : 's'}/card${settings.accounts.length === 1 ? '' : 's'}` : ''}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button label="Profile & banks" icon="person" small onPress={() => router.push('/profile')} />
          {session ? (
            <Button label="Sign out" icon="logout" kind="secondary" small busy={busy === 'signout'} onPress={confirmSignOut} />
          ) : (
            <Button label="Sign in to back up" icon="login" kind="secondary" small onPress={() => router.push('/sign-in?mode=signin')} />
          )}
        </View>
      </Card>

      <SectionTitle>SMS access</SectionTitle>
      <Card style={{ gap: 8 }}>
        <Text style={{ color: c.text }}>
          {!isSmsReaderAvailable
            ? 'Not available in this build (Expo Go or iPhone). Install the Android build.'
            : extra?.permitted
              ? '✅ Allowed. Only messages from your banks are read.'
              : '⚠️ Not allowed yet.'}
        </Text>
        {isSmsReaderAvailable && extra && !extra.permitted ? (
          <Button
            label="Allow SMS access"
            onPress={() =>
              run('perm', async () => {
                await requestSmsPermission();
                notifyDataChanged();
              })
            }
          />
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

      <SectionTitle>Card charges</SectionTitle>
      <Card style={{ gap: 8 }}>
        <Muted>Confirm pending card charges automatically after this many days if the bank hasn’t cancelled them:</Muted>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {[0, 1, 3, 7, 14].map((d) => (
            <Chip key={d} label={d === 0 ? 'Never' : `${d} day${d === 1 ? '' : 's'}`} selected={settings?.autoConfirmDays === d} onPress={() => update({ autoConfirmDays: d })} />
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
              if (v && !(await requestNotificationPermission())) {
                Alert.alert('Notifications are off', 'Turn on notifications for Dr. Tax in Android Settings → Apps → Dr. Tax.');
                return;
              }
              await update({ askWithNotifications: v });
            }}
          />
        </View>
        <Muted>You’ll get buttons like Freelance / Gift / Other… right in the notification. Also warns you about possible Uber double charges.</Muted>
      </Card>

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
        <Muted>Your data lives on this phone and, when you’re signed in, in your private backup. Export a month or year as CSV from the Overview tab.</Muted>
        <Button
          label="Delete all data on this phone"
          kind="danger"
          small
          onPress={() =>
            Alert.alert('Delete everything on this phone?', 'Payments, notes, categories, rules and your profile are removed from this phone and you’re signed out. Your SMS and your server backup are not touched.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => run('wipe', clearPhone) },
            ])
          }
        />
      </Card>
    </Screen>
  );
}
