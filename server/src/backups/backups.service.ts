import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import type { CreateBackupDto, RuleDto, SmsDto, TxnDto } from './dto.js';
import { Backup, Device, Sms, Transaction } from './schemas.js';

export type BackupResult = {
  /** True until the last part of a multi-part backup arrives. */
  partial?: boolean;
  backupId: string | null;
  receivedAt: string;
  counts: { txns: number; sms: number; rules: number; removedTxns: number; removedSms: number };
};

export type Snapshot = {
  /** Pages keep each response under hosting limits (Vercel: 4.5 MB). */
  page: number;
  pageSize: number;
  txnsTotal: number;
  smsTotal: number;
  hasMore: boolean;
  deviceId: string;
  deviceName: string | null;
  lastBackupAt: string | null;
  settings: Record<string, unknown>;
  rules: RuleDto[];
  txns: TxnDto[];
  sms: SmsDto[];
};

@Injectable()
export class BackupsService {
  constructor(
    @InjectModel(Transaction.name) private readonly txns: Model<Transaction>,
    @InjectModel(Sms.name) private readonly sms: Model<Sms>,
    @InjectModel(Device.name) private readonly devices: Model<Device>,
    @InjectModel(Backup.name) private readonly backups: Model<Backup>,
  ) {}

  /**
   * Saves a snapshot from the phone, either in one request or in several parts that share a
   * sessionId. Payments missing from the snapshot are marked removed once the final part arrives.
   * Safe to send the same data again.
   */
  async create(dto: CreateBackupDto): Promise<BackupResult> {
    const started = Date.now();
    const now = new Date();
    const { deviceId } = dto;
    const session = dto.sessionId ?? `single-${randomUUID()}`;
    const final = dto.sessionId ? dto.final === true : true;
    const firstPart = !dto.sessionId || (dto.part ?? 0) === 0;

    // A fresh install has nothing yet. Don't let it wipe an existing backup by accident.
    if (final && firstPart && dto.txns.length === 0 && !dto.allowEmpty) {
      const existing = await this.txns.countDocuments({ deviceId, removedAt: null });
      if (existing > 0) {
        throw new ConflictException(
          `The server already has ${existing} payments for this device. Restore them first, or send allowEmpty: true to clear the backup.`,
        );
      }
    }

    if (dto.txns.length) {
      await this.txns.bulkWrite(
        dto.txns.map((t) => ({
          updateOne: {
            filter: { deviceId, localId: t.localId },
            update: {
              $set: {
                deviceId,
                localId: t.localId,
                smsLocalId: t.smsLocalId ?? null,
                bank: t.bank,
                account: t.account ?? null,
                direction: t.direction,
                amountCents: t.amountCents,
                currency: t.currency,
                merchant: t.merchant,
                description: t.description,
                channel: t.channel,
                occurredAt: new Date(t.occurredAt),
                status: t.status,
                category: t.category,
                categoryLocked: t.categoryLocked,
                flag: t.flag ?? null,
                linkedLocalId: t.linkedLocalId ?? null,
                reviewed: t.reviewed,
                note: t.note ?? null,
                recordedAt: new Date(t.createdAt),
                removedAt: null,
                backedUpAt: now,
                backupSession: session,
              },
            },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }

    if (dto.sms.length) {
      await this.sms.bulkWrite(
        dto.sms.map((m) => ({
          updateOne: {
            filter: { deviceId, localId: m.localId },
            update: {
              $set: {
                deviceId,
                localId: m.localId,
                androidId: m.androidId,
                sender: m.sender,
                bank: m.bank,
                body: m.body,
                receivedAt: new Date(m.receivedAt),
                kind: m.kind,
                txnLocalId: m.txnLocalId ?? null,
                removedAt: null,
                backedUpAt: now,
                backupSession: session,
              },
            },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }

    if (!final) {
      return { partial: true, backupId: null, receivedAt: now.toISOString(), counts: { txns: dto.txns.length, sms: dto.sms.length, rules: 0, removedTxns: 0, removedSms: 0 } };
    }

    // Anything this backup didn't include no longer exists on the phone.
    const removedTxns = await this.txns.updateMany(
      { deviceId, removedAt: null, backupSession: { $ne: session } },
      { $set: { removedAt: now } },
    );
    const removedSms = await this.sms.updateMany(
      { deviceId, removedAt: null, backupSession: { $ne: session } },
      { $set: { removedAt: now } },
    );

    await this.devices.updateOne(
      { deviceId },
      {
        $set: {
          deviceName: dto.deviceName ?? null,
          appVersion: dto.appVersion ?? null,
          settings: dto.settings,
          rules: dto.rules,
          lastBackupAt: now,
        },
      },
      { upsert: true },
    );

    const [txnCount, smsCount] = await Promise.all([
      this.txns.countDocuments({ deviceId, backupSession: session }),
      this.sms.countDocuments({ deviceId, backupSession: session }),
    ]);
    const counts = {
      txns: txnCount,
      sms: smsCount,
      rules: dto.rules.length,
      removedTxns: removedTxns.modifiedCount,
      removedSms: removedSms.modifiedCount,
    };
    const log = await this.backups.create({
      deviceId,
      createdAt: now,
      trigger: dto.trigger ?? 'manual',
      counts,
      durationMs: Date.now() - started,
    });
    return { backupId: String(log._id), receivedAt: now.toISOString(), counts };
  }

  /** Phones that have backed up, newest first. Used to pick what to restore. */
  async listDevices() {
    const devices = await this.devices.find().sort({ lastBackupAt: -1 }).lean();
    return Promise.all(
      devices.map(async (d) => ({
        deviceId: d.deviceId,
        deviceName: d.deviceName,
        appVersion: d.appVersion,
        lastBackupAt: d.lastBackupAt?.toISOString() ?? null,
        txns: await this.txns.countDocuments({ deviceId: d.deviceId, removedAt: null }),
      })),
    );
  }

  /** Recent backup runs, newest first. */
  async history(deviceId?: string, limit = 30) {
    const rows = await this.backups
      .find(deviceId ? { deviceId } : {})
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(limit, 1), 200))
      .lean();
    return rows.map((b) => ({
      backupId: String(b._id),
      deviceId: b.deviceId,
      createdAt: b.createdAt.toISOString(),
      trigger: b.trigger,
      counts: b.counts,
      durationMs: b.durationMs,
    }));
  }

  /** Everything needed to rebuild the phone's database, one page at a time. */
  async snapshot(deviceId: string, page = 0, pageSize = 2000): Promise<Snapshot> {
    const device = await this.devices.findOne({ deviceId }).lean();
    if (!device) throw new NotFoundException(`No backup for device ${deviceId}`);
    const size = Math.min(Math.max(pageSize, 1), 5000);
    const skip = Math.max(page, 0) * size;
    const active = { deviceId, removedAt: null };
    const [txns, sms, txnsTotal, smsTotal] = await Promise.all([
      this.txns.find(active).sort({ localId: 1 }).skip(skip).limit(size).lean(),
      this.sms.find(active).sort({ localId: 1 }).skip(skip).limit(size).lean(),
      this.txns.countDocuments(active),
      this.sms.countDocuments(active),
    ]);
    return {
      page: Math.max(page, 0),
      pageSize: size,
      txnsTotal,
      smsTotal,
      hasMore: skip + size < Math.max(txnsTotal, smsTotal),
      deviceId,
      deviceName: device.deviceName,
      lastBackupAt: device.lastBackupAt?.toISOString() ?? null,
      settings: device.settings ?? {},
      rules: device.rules ?? [],
      txns: txns.map((t) => ({
        localId: t.localId,
        smsLocalId: t.smsLocalId,
        bank: t.bank,
        account: t.account,
        direction: t.direction,
        amountCents: t.amountCents,
        currency: t.currency,
        merchant: t.merchant,
        description: t.description,
        channel: t.channel,
        occurredAt: t.occurredAt.getTime(),
        status: t.status,
        category: t.category,
        categoryLocked: t.categoryLocked,
        flag: t.flag,
        linkedLocalId: t.linkedLocalId,
        reviewed: t.reviewed,
        note: t.note,
        createdAt: t.recordedAt.getTime(),
      })),
      sms: sms.map((m) => ({
        localId: m.localId,
        androidId: m.androidId,
        sender: m.sender,
        bank: m.bank,
        body: m.body,
        receivedAt: m.receivedAt.getTime(),
        kind: m.kind,
        txnLocalId: m.txnLocalId,
      })),
    };
  }
}
