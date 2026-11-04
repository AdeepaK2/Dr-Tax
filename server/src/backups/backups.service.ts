import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import type { CreateBackupDto, RuleDto, SmsDto, TxnDto } from './dto.js';
import { Backup, Device, Sms, Transaction } from './schemas.js';

export type BackupResult = {
  backupId: string;
  receivedAt: string;
  counts: { txns: number; sms: number; rules: number; removedTxns: number; removedSms: number };
};

export type Snapshot = {
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

  /** Saves a full snapshot from the phone. Safe to send the same data again. */
  async create(dto: CreateBackupDto): Promise<BackupResult> {
    const started = Date.now();
    const now = new Date();
    const { deviceId } = dto;

    // A fresh install has nothing yet. Don't let it wipe an existing backup by accident.
    if (dto.txns.length === 0 && !dto.allowEmpty) {
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
              },
            },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }
    const removedTxns = await this.txns.updateMany(
      { deviceId, removedAt: null, localId: { $nin: dto.txns.map((t) => t.localId) } },
      { $set: { removedAt: now } },
    );

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
              },
            },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }
    const removedSms = await this.sms.updateMany(
      { deviceId, removedAt: null, localId: { $nin: dto.sms.map((m) => m.localId) } },
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

    const counts = {
      txns: dto.txns.length,
      sms: dto.sms.length,
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

  /** Everything needed to rebuild the phone's database. */
  async snapshot(deviceId: string): Promise<Snapshot> {
    const device = await this.devices.findOne({ deviceId }).lean();
    if (!device) throw new NotFoundException(`No backup for device ${deviceId}`);
    const [txns, sms] = await Promise.all([
      this.txns.find({ deviceId, removedAt: null }).sort({ localId: 1 }).lean(),
      this.sms.find({ deviceId, removedAt: null }).sort({ localId: 1 }).lean(),
    ]);
    return {
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
