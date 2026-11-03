// Runs the server with a throwaway in-memory MongoDB, for trying it out without installing MongoDB.
// Data is lost when you stop it. Use a real MONGODB_URI (see .env.example) for actual backups.
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongo = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongo.getUri('drtax');
process.env.API_KEY ??= 'dev-key-change-me-0123456789';
console.log(`In-memory MongoDB at ${process.env.MONGODB_URI}`);
console.log(`API key: ${process.env.API_KEY}`);
process.on('SIGINT', async () => {
  await mongo.stop();
  process.exit(0);
});
await import('../dist/main.js');
