import { Body, Controller, DefaultValuePipe, Get, HttpCode, Inject, Param, ParseIntPipe, Post, Query, ValidationPipe } from '@nestjs/common';

import { CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { BackupsService } from './backups.service.js';
import { CreateBackupDto } from './dto.js';

/** Everything here belongs to the signed-in person only. */
@Controller()
export class BackupsController {
  constructor(@Inject(BackupsService) private readonly backups: BackupsService) {}

  /** The phone sends its data here every night (and on "Back up now"). */
  @Post('backups')
  @HttpCode(201)
  // expectedType is explicit so validation never depends on emitted type metadata.
  create(@CurrentUser() user: AuthUser, @Body(new ValidationPipe({ expectedType: CreateBackupDto, whitelist: true, transform: true })) dto: CreateBackupDto) {
    return this.backups.create(user.userId, dto);
  }

  /** Log of your backup runs, newest first. Optional ?deviceId= and ?limit=. */
  @Get('backups')
  history(
    @CurrentUser() user: AuthUser,
    @Query('deviceId') deviceId?: string,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit = 30,
  ) {
    return this.backups.history(user.userId, deviceId, limit);
  }

  /** Your phones that have backed up. */
  @Get('devices')
  devices(@CurrentUser() user: AuthUser) {
    return this.backups.listDevices(user.userId);
  }

  /** Data for one of your phones, used by "Restore". Paged: ?page=0,1,… until hasMore is false. */
  @Get('devices/:deviceId/snapshot')
  snapshot(
    @CurrentUser() user: AuthUser,
    @Param('deviceId') deviceId: string,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page = 0,
    @Query('pageSize', new DefaultValuePipe(2000), ParseIntPipe) pageSize = 2000,
  ) {
    return this.backups.snapshot(user.userId, deviceId, page, pageSize);
  }
}
