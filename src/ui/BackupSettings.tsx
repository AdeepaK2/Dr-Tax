import { useEffect, useState } from 'react';
import { Alert, Pressable, Switch, Text, TextInput, View } from 'react-native';

import {
  backupNow,
  DEFAULT_SERVER_URL,
  getBackupConfig,
  getBackupStatus,
  isInsecureUrl,
  listServerDevices,
  restoreFrom,
  saveBackupConfig,
  testConnection,
  type BackupConfig,
} from '@/lib/backup';
import { useSession } from '@/lib/auth';
import { formatDateTime } from '@/lib/dates';
import { useLoader } from '@/lib/store';

import { Button, Card, Muted, SectionTitle } from './components';
import { useColors } from './theme';

/** Settings → Backup server: where the nightly backup goes, plus manual backup and restore. */
export function BackupSettings() {
  const c = useColors();
  const [config, setConfig] = useState<BackupConfig | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const session = useSession();
  const { data: status } = useLoader(getBackupStatus, []);

  useEffect(() => {
    getBackupConfig().then(setConfig);
  }, []);

  if (!config) return null;
  const cfg = config;

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await saveBackupConfig(cfg);
      await fn();
    } catch (e) {
      Alert.alert('Backup', (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    const devices = await listServerDevices();
    if (devices.length === 0) {
      Alert.alert('Nothing to restore', 'Your account has no backups yet.');
      return;
    }
    Alert.alert(
      'Restore which backup?',
      'This replaces all payments, notes and rules on this phone with the backup.',
      [
        ...devices.slice(0, 3).map((d) => ({
          text: `${d.deviceName ?? d.deviceId} · ${d.txns} payments${d.lastBackupAt ? ` · ${formatDateTime(Date.parse(d.lastBackupAt))}` : ''}`,
          onPress: () =>
            run('restore', async () => {
              const msg = await restoreFrom(d.deviceId);
              setConfig({ ...cfg, deviceId: d.deviceId });
              Alert.alert('Restored', msg);
            }),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
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
  const ready = !!cfg.serverUrl && !!session;

  return (
    <>
      <SectionTitle>Backup</SectionTitle>
      <Card style={{ gap: 10 }}>
        <Muted>
          {session
            ? `Every night your payments, notes, rules and bank SMS are backed up to your account (${session.user.email}). Only you can see them. On a new phone, sign in and restore.`
            : 'Sign in (Settings → Account) to back up every night and restore on a new phone.'}
        </Muted>
        {advanced ? (
        <Field label="Server address">
          <TextInput
            value={cfg.serverUrl}
            onChangeText={(serverUrl) => setConfig({ ...cfg, serverUrl })}
            placeholder={DEFAULT_SERVER_URL}
            placeholderTextColor={c.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={input}
          />
        </Field>
        ) : null}
        {advanced && isInsecureUrl(cfg.serverUrl) ? (
          <Text style={{ color: c.danger, fontSize: 12 }}>
            This address uses http:// over the internet, so your data and sign-in travel unencrypted. Use https:// for a server outside your home network.
          </Text>
        ) : null}
        <Field label="This phone's name">
          <TextInput value={cfg.deviceName} onChangeText={(deviceName) => setConfig({ ...cfg, deviceName })} style={input} />
        </Field>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ flex: 1, color: c.text }}>Back up automatically every night</Text>
          <Switch
            value={cfg.nightly}
            onValueChange={(nightly) => {
              const next = { ...cfg, nightly };
              setConfig(next);
              saveBackupConfig(next);
            }}
          />
        </View>

        {status ? (
          <Text style={{ color: status.ok ? c.text : c.danger, fontSize: 13 }}>
            {status.ok ? '✅' : '⚠️'} {status.trigger === 'nightly' ? 'Nightly backup' : 'Backup'} {formatDateTime(status.at)}: {status.message}
          </Text>
        ) : (
          <Muted>No backup yet.</Muted>
        )}

        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button
            label="Test connection"
            kind="secondary"
            small
            disabled={!ready}
            busy={busy === 'test'}
            onPress={() => run('test', async () => Alert.alert('Backup', await testConnection()))}
          />
          <Button
            label="Back up now"
            small
            disabled={!ready}
            busy={busy === 'backup'}
            onPress={() =>
              run('backup', async () => {
                const s = await backupNow('manual');
                Alert.alert(s.ok ? 'Backed up' : 'Backup failed', s.message);
              })
            }
          />
          <Button label="Restore…" kind="secondary" small disabled={!ready} busy={busy === 'restore'} onPress={() => run('restore', restore)} />
        </View>
        <Pressable onPress={() => setAdvanced(!advanced)} hitSlop={6}>
          <Text style={{ color: c.muted, fontSize: 12 }}>{advanced ? 'Hide advanced' : 'Advanced: server address'} · Phone ID {cfg.deviceId}</Text>
        </Pressable>
      </Card>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: c.text, fontWeight: '600' }}>{label}</Text>
      {children}
    </View>
  );
}
