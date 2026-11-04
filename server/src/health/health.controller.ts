import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

import { Public } from '../auth/api-key.guard.js';

@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  /** Used by the app's "Test connection" button and by uptime checks. */
  @Public()
  @Get()
  check() {
    const db = this.connection.readyState === 1 ? 'up' : 'down';
    return { ok: db === 'up', db, time: new Date().toISOString() };
  }
}
