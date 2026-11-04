import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, DefaultValuePipe } from '@nestjs/common';

import { BackupsService } from './backups.service.js';
import { CreateBackupDto } from './dto.js';

@Controller()
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  /** The phone sends its full data here every night (and on "Back up now"). */
  @Post('backups')
  @HttpCode(201)
  create(@Body() dto: CreateBackupDto) {
    return this.backups.create(dto);
  }

  /** Log of backup runs, newest first. Optional ?deviceId= and ?limit=. */
  @Get('backups')
  history(@Query('deviceId') deviceId?: string, @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit = 30) {
    return this.backups.history(deviceId, limit);
  }

  /** Phones that have backed up. */
  @Get('devices')
  devices() {
    return this.backups.listDevices();
  }

  /** Full data for one phone, used by "Restore from server". */
  @Get('devices/:deviceId/snapshot')
  snapshot(@Param('deviceId') deviceId: string) {
    return this.backups.snapshot(deviceId);
  }
}
