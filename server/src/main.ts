import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module.js';
import { loadConfig } from './config.js';
import { configureApp } from './setup.js';

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), { bodyParser: false });
  configureApp(app, config);
  await app.listen(config.port, '0.0.0.0');
  Logger.log(`Dr. Tax backup server listening on port ${config.port}`, 'Bootstrap');
}
await bootstrap();
