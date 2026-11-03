import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { BackupsController } from './backups.controller.js';
import { BackupsService } from './backups.service.js';
import { Backup, BackupSchema, Device, DeviceSchema, Sms, SmsSchema, Transaction, TransactionSchema } from './schemas.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Transaction.name, schema: TransactionSchema },
      { name: Sms.name, schema: SmsSchema },
      { name: Device.name, schema: DeviceSchema },
      { name: Backup.name, schema: BackupSchema },
    ]),
  ],
  controllers: [BackupsController],
  providers: [BackupsService],
})
export class BackupsModule {}
