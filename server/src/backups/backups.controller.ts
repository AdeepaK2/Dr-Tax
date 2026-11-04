import { Body, Controller, DefaultValuePipe, Get, HttpCode, Inject, Param, ParseIntPipe, Post, Query, ValidationPipe } from '@nestjs/common';

import { BackupsService } from './backups.service.js';
import { CreateBackupDto } from './dto.js';

@Controller()
export class BackupsController {
  constructor(@Inject(BackupsService) private readonly backups: BackupsService) {}

  /** The phone sends its full data here every night (and on "Back up now"). */
  @Post('backups')
  @HttpCode(201)
  // expectedType is explicit so validation never depends on emitted type metadata.
  create(@Body(new ValidationPipe({ expectedType: CreateBackupDto, whitelist: true, transform: true })) dto: CreateBackupDto) {
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

  /** Data for one phone, used by "Restore from server". Paged: ?page=0,1,… until hasMore is false. */
  @Get('devices/:deviceId/snapshot')
  snapshot(
    @Param('deviceId') deviceId: string,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page = 0,
    @Query('pageSize', new DefaultValuePipe(2000), ParseIntPipe) pageSize = 2000,
  ) {
    return this.backups.snapshot(deviceId, page, pageSize);
  }
}
