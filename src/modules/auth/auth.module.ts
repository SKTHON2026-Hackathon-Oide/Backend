import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Users } from './infrastructure/persistence/typeorm/entities/users.entity';

@Module({ imports: [TypeOrmModule.forFeature([Users])], exports: [TypeOrmModule] })
export class AuthModule {}
