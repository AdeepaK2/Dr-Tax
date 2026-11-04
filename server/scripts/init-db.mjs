// Creates the Dr. Tax collections and indexes in MongoDB (safe to run again).
//   npm run db:init        (reads MONGODB_URI from .env)
import mongoose from 'mongoose';

import { UserSchema } from '../dist/auth/user.schema.js';
import { BackupSchema, DeviceSchema, SmsSchema, TransactionSchema } from '../dist/backups/schemas.js';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set (see .env.example).');
  process.exit(1);
}

const models = [
  mongoose.model('User', UserSchema),
  mongoose.model('Transaction', TransactionSchema),
  mongoose.model('Sms', SmsSchema),
  mongoose.model('Device', DeviceSchema),
  mongoose.model('Backup', BackupSchema),
];

await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });
const db = mongoose.connection.db;
console.log(`Connected to database "${db.databaseName}"`);

for (const model of models) {
  await model.createCollection();
  await model.syncIndexes();
  const indexes = await model.collection.indexes();
  console.log(`  ${model.collection.collectionName.padEnd(13)} indexes: ${indexes.map((i) => i.name).join(', ')}`);
}

await mongoose.disconnect();
console.log('Done.');
