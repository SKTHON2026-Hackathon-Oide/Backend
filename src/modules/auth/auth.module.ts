import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createClerkClient } from '@clerk/backend';
import type { ClerkClient } from '@clerk/backend';
import { CLERK_CLIENT } from './auth.tokens';
import { CurrentUserService } from './application/services/current-user.service';
import { USER_PRESENCE_PORT } from './domain/ports/user-presence.port';
import { Users } from './infrastructure/persistence/typeorm/entities/users.entity';
import { TypeOrmUserPresenceRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-user-presence.repository';
import { ClerkAuthGuard } from './interfaces/http/clerk-auth.guard';
import { AuthController } from './interfaces/http/auth.controller';
import { ClerkWebhookController } from './interfaces/http/clerk-webhook.controller';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([Users])],
  controllers: [AuthController, ClerkWebhookController],
  providers: [
    TypeOrmUserPresenceRepository,
    CurrentUserService,
    ClerkAuthGuard,
    {
      provide: CLERK_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ClerkClient =>
        createClerkClient({
          publishableKey: config.get<string>('CLERK_PUBLISHABLE_KEY'),
          secretKey: config.get<string>('CLERK_SECRET_KEY'),
        }),
    },
    {
      provide: USER_PRESENCE_PORT,
      useExisting: TypeOrmUserPresenceRepository,
    },
  ],
  exports: [
    TypeOrmModule,
    USER_PRESENCE_PORT,
    CurrentUserService,
    ClerkAuthGuard,
  ],
})
export class AuthModule {}
