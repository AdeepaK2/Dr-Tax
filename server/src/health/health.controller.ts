import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

import { Public } from '../auth/auth.guard.js';

/** Short, safe explanation of a connection error (no connection strings or passwords). */
function reason(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/whitelist|IP address|not authorized to access|ReplicaSetNoPrimary|Could not connect to any servers/i.test(msg)) {
    return 'Cannot reach MongoDB. In Atlas → Network Access, allow this host (0.0.0.0/0 for Vercel).';
  }
  if (/auth|bad auth|Authentication failed/i.test(msg)) return 'MongoDB rejected the username or password in MONGODB_URI.';
  if (/ENOTFOUND|querySrv|getaddrinfo/i.test(msg)) return 'MongoDB host not found. Check the cluster address in MONGODB_URI.';
  if (/timed out|timeout/i.test(msg)) return 'Timed out connecting to MongoDB. Check Atlas Network Access.';
  return msg.replace(/mongodb(\+srv)?:\/\/\S+/gi, '<uri>').slice(0, 200);
}

@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  /** Used by the app's "Test connection" button and by uptime checks. */
  @Public()
  @Get()
  async check() {
    const time = new Date().toISOString();
    try {
      if (this.connection.readyState !== 1) {
        await Promise.race([
          this.connection.asPromise(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), 10_000)),
        ]);
      }
      await this.connection.db!.admin().ping();
      return { ok: true, db: 'up', time };
    } catch (e) {
      return { ok: false, db: 'down', error: reason(e), time };
    }
  }
}
