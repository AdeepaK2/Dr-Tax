import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Text, View } from 'react-native';

import { isSmsReaderAvailable } from '../../modules/sms-reader';
import { finishSetup } from '@/lib/appState';
import { registerBackgroundSync } from '@/lib/backgroundSync';
import { listServerDevices, restoreFrom, type ServerDevice } from '@/lib/backup';
import { getSession, pushProfile, useSession, type ServerProfile } from '@/lib/auth';
import { bankInfo } from '@/lib/banks';
import { formatDateTime } from '@/lib/dates';
import { scanInboxBanks, type DetectedBank } from '@/lib/detect';
import { requestNotificationPermission } from '@/lib/notify';
import { DEFAULT_SETTINGS, loadSettings, type AppSettings } from '@/lib/settings';
import { hasSmsPermission, requestSmsPermission, syncSms } from '@/lib/sync';
import { Button, Card, Muted, Screen } from '@/ui/components';
import { BanksEditor, NamesInput, TextField } from '@/ui/forms';
import { Icon, IconBadge } from '@/ui/glass';
import { useColors } from '@/ui/theme';

const STEPS = ['About you', 'Bank SMS', 'Your banks', 'All set'];

export default function Setup() {
  const c = useColors();
  const session = useSession();
  // Opened from Welcome ("use without an account") or after signing in; otherwise start at Welcome.
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [detected, setDetected] = useState<DetectedBank[]>([]);
  const [devices, setDevices] = useState<ServerDevice[]>([]);
  const [busy, setBusy] = useState(false);

  // Start from saved settings, filled in from your account (handy on a new phone).
  useEffect(() => {
    (async () => {
      const base = await loadSettings();
      const s = await getSession();
      const server = (s?.user.profile ?? {}) as Partial<ServerProfile>;
      setDraft({
        ...DEFAULT_SETTINGS,
        ...base,
        profile: {
          name: base.profile.name || s?.user.name || '',
          otherNames: base.profile.otherNames.length ? base.profile.otherNames : (server.otherNames ?? []),
        },
        banks: base.banks.length ? base.banks : (server.banks ?? []),
        accounts: base.accounts.length ? base.accounts : (server.accounts ?? []),
      });
      if (s) listServerDevices().then(setDevices, () => {});
      // Already allowed SMS earlier? Find your banks straight away.
      if (await hasSmsPermission()) {
        const found = await scanInboxBanks();
        setDetected(found);
        if (!base.banks.length && !server.banks?.length) {
          setDraft((d) => (d ? { ...d, banks: [...new Set([...d.banks, ...found.map((f) => f.bank.id)])] } : d));
        }
      }
    })();
  }, []);

  async function scan(preselect: boolean) {
    const found = await scanInboxBanks();
    setDetected(found);
    if (preselect && found.length) {
      setDraft((d) => (d ? { ...d, banks: [...new Set([...d.banks, ...found.map((f) => f.bank.id)])] } : d));
    }
  }

  async function allowSms() {
    setBusy(true);
    try {
      if ((await hasSmsPermission()) || (await requestSmsPermission())) {
        await scan(true);
        setStep(2);
      } else {
        Alert.alert('SMS access not allowed', 'You can still pick your banks and allow SMS later in Settings.');
        setStep(2);
      }
    } finally {
      setBusy(false);
    }
  }

  async function finish(restoreDevice?: ServerDevice) {
    if (!draft) return;
    setBusy(true);
    try {
      if (restoreDevice) {
        const msg = await restoreFrom(restoreDevice.deviceId);
        Alert.alert('Restored', msg);
      }
      const final = { ...(await loadSettings()), ...draft, onboarded: true };
      await finishSetup(final);
      pushProfile(final).catch(() => {});
      // Start reading SMS straight away, and ask before sending notifications.
      registerBackgroundSync().catch(() => {});
      requestNotificationPermission()
        .then(() => syncSms())
        .catch(() => {});
    } catch (e) {
      Alert.alert('Could not finish', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!from) return <Redirect href="/welcome" />;
  if (!draft) return null;
  const firstName = draft.profile.name.split(/\s+/)[0];

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Screen title={STEPS[step]} subtitle={`Step ${step + 1} of ${STEPS.length}`}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {STEPS.map((s, i) => (
            <View key={s} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= step ? c.primary : c.track }} />
          ))}
        </View>

        {step === 0 ? (
          <>
            <Card strong style={{ gap: 14 }}>
              <TextField
                label="Your name"
                value={draft.profile.name}
                onChangeText={(name) => setDraft({ ...draft, profile: { ...draft.profile, name } })}
                placeholder="e.g. Adeepa Kularathna"
                autoCapitalize="words"
              />
              <View style={{ gap: 6 }}>
                <Text style={{ color: c.text, fontWeight: '700' }}>Other names on your bank SMS</Text>
                <Muted style={{ paddingHorizontal: 0 }}>
                  Banks often use initials, like “GGAS KULARATHNA”. Money sent to these names (or your first name) is counted as moving your own money, not spending.
                </Muted>
                <NamesInput
                  value={draft.profile.otherNames}
                  onChange={(otherNames) => setDraft({ ...draft, profile: { ...draft.profile, otherNames } })}
                  placeholder="e.g. GGAS KULARATHNA"
                />
              </View>
            </Card>
            <Button label="Next" icon="arrow_forward" disabled={!draft.profile.name.trim()} onPress={() => setStep(1)} />
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Card strong style={{ gap: 14, alignItems: 'center', paddingVertical: 24 }}>
              <IconBadge name="sms" color="#14B8A6" size={64} />
              <Text style={{ color: c.text, fontSize: 18, fontWeight: '800', textAlign: 'center' }}>
                {firstName ? `${firstName}, let Dr. Tax read your bank SMS` : 'Let Dr. Tax read your bank SMS'}
              </Text>
              <Text style={{ color: c.textSecondary, textAlign: 'center', lineHeight: 20 }}>
                We’ll find which banks message you and set them up automatically. Only messages from your banks are read; personal SMS and one-time codes are ignored.
              </Text>
            </Card>
            {isSmsReaderAvailable ? <Button label="Allow SMS access" icon="sms" busy={busy} onPress={allowSms} /> : <Muted>SMS reading isn’t available on this device.</Muted>}
            <Button label="Pick banks myself" kind="secondary" onPress={() => setStep(2)} />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Muted>
              {detected.length
                ? `Found ${detected.length} bank${detected.length === 1 ? '' : 's'} in your SMS and turned ${detected.length === 1 ? 'it' : 'them'} on. Add your accounts and cards so payments show which one they came from.`
                : 'Turn on the banks you use. Their SMS are read with the matching template.'}
            </Muted>
            <BanksEditor
              banks={draft.banks}
              accounts={draft.accounts}
              detected={detected}
              onChange={({ banks, accounts }) => setDraft({ ...draft, banks, accounts })}
            />
            <Button label="Next" icon="arrow_forward" onPress={() => setStep(3)} />
            <Button label="Back" kind="secondary" onPress={() => setStep(1)} />
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Card strong tintColor="#14B8A6" style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icon name="check_circle" size={28} color={c.primary} />
                <Text style={{ color: c.text, fontSize: 18, fontWeight: '800' }}>You’re ready{firstName ? `, ${firstName}` : ''}</Text>
              </View>
              <Text style={{ color: c.textSecondary }}>
                {draft.banks.length
                  ? `Reading SMS from ${draft.banks.map((b) => bankInfo(b).short).join(', ')}${draft.accounts.length ? ` · ${draft.accounts.length} account${draft.accounts.length === 1 ? '' : 's'}/card${draft.accounts.length === 1 ? '' : 's'}` : ''}.`
                  : 'No banks yet. You can add them any time in Settings → Profile & banks.'}
              </Text>
              <Text style={{ color: c.textSecondary }}>
                {session ? `Signed in as ${session.user.email}. Backups run every night.` : 'Not signed in: your data stays on this phone. Sign in later in Settings to back up.'}
              </Text>
            </Card>
            {devices.length ? (
              <Card style={{ gap: 10 }}>
                <Text style={{ color: c.text, fontWeight: '800' }}>Restore a backup?</Text>
                <Muted style={{ paddingHorizontal: 0 }}>Your account has backups from before. Restoring brings back your payments, notes and categories.</Muted>
                {devices.slice(0, 3).map((d) => (
                  <Button
                    key={d.deviceId}
                    kind="secondary"
                    icon="restore"
                    busy={busy}
                    label={`${d.deviceName ?? 'Phone'} · ${d.txns} payments${d.lastBackupAt ? ` · ${formatDateTime(Date.parse(d.lastBackupAt))}` : ''}`}
                    onPress={() => finish(d)}
                  />
                ))}
              </Card>
            ) : null}
            <Button label={devices.length ? 'Start fresh instead' : 'Start using Dr. Tax'} icon="arrow_forward" busy={busy} onPress={() => finish()} />
            <Button label="Back" kind="secondary" onPress={() => setStep(2)} />
          </>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
