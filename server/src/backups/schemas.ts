import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, type HydratedDocument } from 'mongoose';

/**
 * One payment, as recorded on the phone. Keyed by (deviceId, localId), so every nightly
 * backup updates the same document instead of adding a copy.
 */
@Schema({ collection: 'transactions', timestamps: true })
export class Transaction {
  /** Owner (account id). */
  @Prop({ type: String, required: true, index: true }) userId: string;
  @Prop({ type: String, required: true }) deviceId: string;
  @Prop({ type: Number, required: true }) localId: number;
  @Prop({ type: Number, default: null }) smsLocalId: number | null;
  @Prop({ type: String, required: true }) bank: string;
  @Prop({ type: String, default: null }) account: string | null;
  @Prop({ type: String, required: true, enum: ['debit', 'credit'] }) direction: 'debit' | 'credit';
  @Prop({ type: Number, required: true }) amountCents: number;
  @Prop({ type: String, required: true }) currency: string;
  @Prop({ type: String, required: true }) merchant: string;
  @Prop({ type: String, default: '' }) description: string;
  @Prop({ type: String, required: true }) channel: string;
  @Prop({ type: Date, required: true, index: true }) occurredAt: Date;
  @Prop({ type: String, required: true }) status: string;
  @Prop({ type: String, required: true, index: true }) category: string;
  @Prop({ type: Boolean, default: false }) categoryLocked: boolean;
  @Prop({ type: String, default: null }) flag: string | null;
  @Prop({ type: Number, default: null }) linkedLocalId: number | null;
  @Prop({ type: Boolean, default: false }) reviewed: boolean;
  @Prop({ type: String, default: null }) note: string | null;
  @Prop({ type: Date, required: true }) recordedAt: Date;
  /** Set when the payment no longer exists on the phone. Kept, never hard-deleted. */
  @Prop({ type: Date, default: null }) removedAt: Date | null;
  @Prop({ type: Date, required: true }) backedUpAt: Date;
  /** The backup that last included this payment. */
  @Prop({ type: String, default: null }) backupSession: string | null;
}
export type TransactionDocument = HydratedDocument<Transaction>;
export const TransactionSchema = SchemaFactory.createForClass(Transaction);
TransactionSchema.index({ userId: 1, deviceId: 1, localId: 1 }, { unique: true });

/** The original bank SMS behind a payment: the evidence for your records. */
@Schema({ collection: 'sms', timestamps: true })
export class Sms {
  /** Owner (account id). */
  @Prop({ type: String, required: true, index: true }) userId: string;
  @Prop({ type: String, required: true }) deviceId: string;
  @Prop({ type: Number, required: true }) localId: number;
  @Prop({ type: String, required: true }) androidId: string;
  @Prop({ type: String, required: true }) sender: string;
  @Prop({ type: String, required: true }) bank: string;
  @Prop({ type: String, required: true }) body: string;
  @Prop({ type: Date, required: true }) receivedAt: Date;
  @Prop({ type: String, required: true }) kind: string;
  @Prop({ type: Number, default: null }) txnLocalId: number | null;
  @Prop({ type: Date, default: null }) removedAt: Date | null;
  @Prop({ type: Date, required: true }) backedUpAt: Date;
  @Prop({ type: String, default: null }) backupSession: string | null;
}
export type SmsDocument = HydratedDocument<Sms>;
export const SmsSchema = SchemaFactory.createForClass(Sms);
SmsSchema.index({ userId: 1, deviceId: 1, localId: 1 }, { unique: true });

/** Per-phone settings and category rules, replaced on every backup. */
@Schema({ collection: 'devices', timestamps: true })
export class Device {
  @Prop({ type: String, required: true, index: true }) userId: string;
  @Prop({ type: String, required: true }) deviceId: string;
  @Prop({ type: String, default: null }) deviceName: string | null;
  @Prop({ type: String, default: null }) appVersion: string | null;
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} }) settings: Record<string, unknown>;
  @Prop({ type: [{ localId: Number, pattern: String, category: String, createdAt: Number, _id: false }], default: [] })
  rules: { localId: number; pattern: string; category: string; createdAt: number }[];
  @Prop({ type: Date, default: null }) lastBackupAt: Date | null;
}
export type DeviceDocument = HydratedDocument<Device>;
export const DeviceSchema = SchemaFactory.createForClass(Device);
DeviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true });

/** A log line for every backup run, so you can see the nightly job is working. */
@Schema({ collection: 'backups' })
export class Backup {
  /** Owner (account id). */
  @Prop({ type: String, required: true, index: true }) userId: string;
  @Prop({ type: String, required: true }) deviceId: string;
  @Prop({ type: Date, required: true }) createdAt: Date;
  @Prop({ type: String, default: 'manual' }) trigger: string;
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  counts: { txns: number; sms: number; rules: number; removedTxns: number; removedSms: number };
  @Prop({ type: Number, required: true }) durationMs: number;
}
export type BackupDocument = HydratedDocument<Backup>;
export const BackupSchema = SchemaFactory.createForClass(Backup);
BackupSchema.index({ userId: 1, deviceId: 1, createdAt: -1 });
