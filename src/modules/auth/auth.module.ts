import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { USER_PRESENCE_PORT } from './domain/ports/user-presence.port';
import { Users } from './infrastructure/persistence/typeorm/entities/users.entity';
import { TypeOrmUserPresenceRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-user-presence.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Users])],
  providers: [
    TypeOrmUserPresenceRepository,
    {
      provide: USER_PRESENCE_PORT,
      useExisting: TypeOrmUserPresenceRepository,
    },
  ],
  exports: [TypeOrmModule, USER_PRESENCE_PORT],
})
export class AuthModule {}
