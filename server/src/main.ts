import { createServer } from 'node:http';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module.js';
import { loadConfig, type AppConfig } from './config.js';
import { configureApp } from './setup.js';

async function bootstrap() {
  let config: AppConfig;
  try {
    config = loadConfig();
  } catch (e) {
    // Missing settings (e.g. env vars not added on the host): answer every request with the
    // reason instead of crashing, so it shows up in the browser and in the app's "Test connection".
    const error = (e as Error).message;
    Logger.error(error, 'Config');
    createServer((_req, res) => {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: `Server not configured: ${error}` }));
    }).listen(Number(process.env.PORT ?? 3000));
    return;
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), { bodyParser: false });
  configureApp(app, config);
  await app.listen(config.port, '0.0.0.0');
  Logger.log(`Dr. Tax backup server listening on port ${config.port}`, 'Bootstrap');
}
await bootstrap();
