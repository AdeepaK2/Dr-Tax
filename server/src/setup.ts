import { ValidationPipe, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

import type { AppConfig } from './config.js';

/** Shared by main.ts and the e2e tests, so tests run the same app as production. */
export function configureApp(app: INestApplication, config: AppConfig) {
  const express = app as NestExpressApplication;
  // A nightly backup holds every payment and SMS, which is far over Express's 100 kB default.
  express.useBodyParser('json', { limit: config.bodyLimit });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();
  return app;
}
