import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';

import { ApiKeyGuard } from './auth/api-key.guard.js';
import { BackupsModule } from './backups/backups.module.js';
import { APP_CONFIG, type AppConfig } from './config.js';
import { HealthController } from './health/health.controller.js';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        MongooseModule.forRoot(config.mongoUri, {
          // Start serving straight away (health can then report a database problem) and fail
          // fast instead of retrying for minutes, which would hang serverless requests.
          lazyConnection: true,
          serverSelectionTimeoutMS: 10_000,
          retryAttempts: 1,
          retryDelay: 1_000,
        }),
        BackupsModule,
      ],
      controllers: [HealthController],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        { provide: APP_GUARD, useClass: ApiKeyGuard },
      ],
      exports: [APP_CONFIG],
    };
  }
}
