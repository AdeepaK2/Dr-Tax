import { Body, Controller, Get, HttpCode, Inject, Post, Put, ValidationPipe } from '@nestjs/common';

import { LoginDto, RegisterDto, UpdateProfileDto } from './auth.dto.js';
import { CurrentUser, Public, type AuthUser } from './auth.guard.js';
import { AuthService } from './auth.service.js';

// expectedType is explicit so validation never depends on emitted type metadata (see backups.controller).
const body = <T>(type: new () => T) => new ValidationPipe({ expectedType: type, whitelist: true, transform: true });

@Controller()
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  /** Create an account. Returns a login token. */
  @Public()
  @Post('auth/register')
  @HttpCode(201)
  register(@Body(body(RegisterDto)) dto: RegisterDto) {
    return this.auth.register(dto);
  }

  /** Sign in. Returns a login token. */
  @Public()
  @Post('auth/login')
  @HttpCode(200)
  login(@Body(body(LoginDto)) dto: LoginDto) {
    return this.auth.login(dto);
  }

  /** The signed-in person's account and profile. */
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId);
  }

  @Put('me')
  update(@CurrentUser() user: AuthUser, @Body(body(UpdateProfileDto)) dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.userId, dto);
  }
}
