/**
 * Writes a shell script that puts SMS into an Android emulator's inbox.
 *   npx tsx simulator/device-sms.ts screenshots > sms.sh   (your screenshot SMS)
 *   npx tsx simulator/device-sms.ts today > sms.sh         (new test SMS dated now)
 * Run on a rooted emulator:  adb root; adb push sms.sh /data/local/tmp/; adb shell sh /data/local/tmp/sms.sh
 */
import { SCREENSHOT_INBOX, type FakeSms } from './inbox';

/** Quote a whole argument for sh. */
const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
/** `--bind name:type:value`. The content tool splits on ':', so colons in the value are escaped. */
const bind = (name: string, type: string, value: string | number) =>
  `--bind ${shq(`${name}:${type}:${String(value).replace(/:/g, '\\:')}`)}`;

function today(): FakeSms[] {
  const now = Date.now();
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:00`;
  return [
    { address: 'SAMPATHTXN', body: `LKR 45,000.00 credited to AC **5375 for TFR Kasun -000099112233 ${stamp} To Inq Call 0112303050`, date: now - 30_000 },
    { address: 'SAMPATHTXN', body: `LKR 7,500.00 debited from AC **5375 for TFR Nimal -000011223344 ${stamp} To Inq Call 0112303050`, date: now - 20_000 },
  ];
}

const which = process.argv[2] ?? 'screenshots';
const list = which === 'today' ? today() : SCREENSHOT_INBOX;
const lines = list.map(
  (m) =>
    `content insert --uri content://sms/inbox ${bind('address', 's', m.address)} ${bind('body', 's', m.body)} ${bind('date', 'l', m.date)} ${bind('read', 'i', 0)} ${bind('type', 'i', 1)}`,
);
process.stdout.write(lines.join('\n') + '\necho inserted ' + lines.length + '\n');
