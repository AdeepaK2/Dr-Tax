import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

import { APP_CONFIG, type AppConfig } from '../config.js';

const IS_PUBLIC = 'isPublic';
/** Marks a route as reachable without the API key (health check only). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Every request must send the shared secret in the `x-api-key` header. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly expected: Buffer;

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.expected = digest(config.apiKey);
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const header = context.switchToHttp().getRequest<Request>().header('x-api-key') ?? '';
    // Compare fixed-length digests so the check takes the same time for any input.
    if (!header || !timingSafeEqual(digest(header), this.expected)) {
      throw new UnauthorizedException('Missing or wrong API key');
    }
    return true;
  }
}
