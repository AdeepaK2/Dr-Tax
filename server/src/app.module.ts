import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
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
        JwtModule.register({ global: true, secret: config.jwtSecret, signOptions: { algorithm: 'HS256' }, verifyOptions: { algorithms: ['HS256'] } }),
        AuthModule,
        BackupsModule,
      ],
      controllers: [HealthController],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        // Signed-in users only, except routes marked @Public().
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
      exports: [APP_CONFIG],
    };
  }
}
