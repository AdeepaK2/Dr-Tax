/**
 * Backup round trip against a running Dr. Tax server, using the app's real code.
 *   (in server/)  JWT_SECRET=... npm run start:memory
 *   DRTAX_SERVER=http://localhost:3000 npm run simulate:backup
 */
import { signIn, signOut, signUp } from '../src/lib/auth';
import { backupNow, getBackupConfig, listServerDevices, maybeNightlyBackup, restoreFrom, saveBackupConfig } from '../src/lib/backup';
import { addRule, getSetting, listAllSms, listAllTxns, listRules, setSetting, updateTxn, wipeAll } from '../src/lib/db';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../src/lib/settings';
import { syncSms } from '../src/lib/sync';
import { SCREENSHOT_INBOX } from './inbox';
import { inbox } from './mocks/sms-reader';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
}
async function errorOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return '';
  } catch (e) {
    return (e as Error).message;
  }
}

async function main() {
  const serverUrl = process.env.DRTAX_SERVER ?? 'http://localhost:3000';
  const email = `sim-${Date.now()}@example.com`;
  const password = 'simulator password';

  // First-run setup: profile + banks, then the inbox is read.
  await saveSettings({ ...DEFAULT_SETTINGS, profile: { name: 'Adeepa Kularathna', otherNames: [] }, banks: ['sampath', 'combank', 'peoples'], onboarded: true });
  SCREENSHOT_INBOX.forEach((m, i) => inbox.push({ id: String(i + 1), ...m }));
  await syncSms();
  const before = await listAllTxns();
  const vishwa = before.find((t) => t.merchant === 'Vishwa')!;
  await updateTxn(vishwa.id, { category: 'gift_given', category_locked: 1, note: 'Birthday gift' });
  await addRule('VISHWA', 'gift_given');

  const cfg = await getBackupConfig();
  await saveBackupConfig({ ...cfg, serverUrl, deviceName: 'Simulator' });
  console.log(`\nServer ${serverUrl}, phone id ${cfg.deviceId}`);

  console.log('\n1. Accounts');
  const signedOut = await backupNow('manual');
  check('Backup while signed out asks you to sign in', !signedOut.ok && /Sign in/.test(signedOut.message), signedOut.message);
  const session = await signUp({ email, password, name: 'Adeepa Kularathna' });
  check('Create account', !!session.token && session.user.email === email, session.user.email);
  check('Same email cannot sign up twice', /already exists/.test(await errorOf(() => signUp({ email, password, name: 'X' }))));
  await signOut();
  const wrong = await errorOf(() => signIn({ email, password: 'not my password' }));
  check('Wrong password is refused', /Wrong email or password/.test(wrong), wrong);
  await signIn({ email, password });

  console.log('\n2. Back up');
  const ok = await backupNow('manual');
  check('Backup succeeds', ok.ok, ok.message);
  const mine = (await listServerDevices()).find((d) => d.deviceId === cfg.deviceId);
  check('Your account lists this phone with all payments', mine?.txns === before.length, `${mine?.txns} of ${before.length}`);

  console.log('\n2b. Large backup sent in parts (as needed on Vercel)');
  const multi = await backupNow('manual', Date.now(), 2_000);
  check('Multi-part backup succeeds', multi.ok && /in \d+ parts/.test(multi.message), multi.message);
  const again = (await listServerDevices()).find((d) => d.deviceId === cfg.deviceId);
  check('Server still has every payment, none marked removed', again?.txns === before.length, `${again?.txns}`);

  console.log('\n3. Nightly schedule');
  const at = (h: number) => new Date(2026, 10, 4, h, 0).getTime();
  check('No second backup the same evening (2 PM, backed up minutes ago)', (await maybeNightlyBackup(at(14))) === null);
  await setSetting('backup_last_ok', String(at(2) - 24 * 3600_000));
  await setSetting('backup_status', JSON.stringify({ at: at(2) - 24 * 3600_000, ok: true, message: '', trigger: 'nightly' }));
  check('Skips during the day when last backup was < 36 h ago', (await maybeNightlyBackup(at(14) - 24 * 3600_000 + 6 * 3600_000)) === null);
  const night = await maybeNightlyBackup(at(2));
  check('Runs at 2 AM when last backup was yesterday', night?.ok === true && night.trigger === 'nightly', night?.message);
  check('Does not run twice the same night', (await maybeNightlyBackup(at(3))) === null);

  console.log('\n3b. Another person sees none of it');
  await signOut();
  check('Nightly backup does nothing while signed out', (await maybeNightlyBackup(at(2) + 2 * 24 * 3600_000)) === null);
  await signUp({ email: `other-${Date.now()}@example.com`, password: 'someone else 1', name: 'Kasun' });
  check('Other account sees no devices', (await listServerDevices()).length === 0);
  const denied = await errorOf(() => restoreFrom(cfg.deviceId));
  check("Other account can't restore your backup", /No backup/.test(denied), denied);
  await signOut();

  console.log('\n4. Lose the phone: new phone, sign in, restore');
  await wipeAll();
  check('Local data is gone', (await listAllTxns()).length === 0);
  // A fresh phone uses the built-in server; point it at the test server again.
  await saveBackupConfig({ ...(await getBackupConfig()), serverUrl });
  await signIn({ email, password });
  const emptyNightly = await backupNow('nightly');
  check('An empty phone does not overwrite the backup', emptyNightly.message === 'Nothing to back up yet.', emptyNightly.message);
  const msg = await restoreFrom(cfg.deviceId);
  console.log(`  ${msg}`);
  const after = await listAllTxns();
  check('All payments restored', after.length === before.length, `${after.length}`);
  const v2 = after.find((t) => t.id === vishwa.id);
  check('Your sorting and notes came back', v2?.category === 'gift_given' && v2?.note === 'Birthday gift');
  check(
    'Statuses came back (Uber cancellation, possible hold)',
    after.filter((t) => t.status === 'cancelled').length === before.filter((t) => t.status === 'cancelled').length && after.some((t) => t.flag === 'possible_hold'),
  );
  check('Rules came back', (await listRules()).some((r) => r.pattern === 'VISHWA'));
  check('Bank SMS came back', (await listAllSms()).length > 0);
  const restored = await loadSettings();
  check('Profile and banks came back', restored.profile.name === 'Adeepa Kularathna' && restored.banks.includes('sampath'));

  console.log('\n5. After restoring on a new phone, syncing the same inbox adds no duplicates');
  const sms = await listAllSms();
  inbox.length = 0;
  // A new phone: same messages, different Android ids.
  SCREENSHOT_INBOX.forEach((m, i) => inbox.push({ id: String(500 + i), ...m }));
  await setSetting('last_sms_date', '0');
  const r = await syncSms();
  check('No duplicates from re-reading the inbox', r.added === 0 && (await listAllTxns()).length === before.length, `added ${r.added}`);
  check('SMS count unchanged', (await listAllSms()).length === sms.length);
  check('Still backing up to the same record', (await getBackupConfig()).deviceId === cfg.deviceId && !!(await getSetting('backup_config')));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
