import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

export type RawSms = { id: string; address: string; body: string; date: number };
export type SenderCount = { address: string; count: number };

type SmsReaderNative = {
  readInbox(sinceMs: number, senders: string[]): Promise<RawSms[]>;
  listSenders(limit: number): Promise<SenderCount[]>;
};

const Native =
  Platform.OS === 'android' ? requireOptionalNativeModule<SmsReaderNative>('SmsReader') : null;

/** False in Expo Go, on iOS (no SMS access), and on web. */
export const isSmsReaderAvailable = Native != null;

export function readInbox(sinceMs: number, senders: string[]): Promise<RawSms[]> {
  if (!Native) return Promise.resolve([]);
  return Native.readInbox(sinceMs, senders);
}

export function listSenders(limit = 30): Promise<SenderCount[]> {
  if (!Native) return Promise.resolve([]);
  return Native.listSenders(limit);
}
