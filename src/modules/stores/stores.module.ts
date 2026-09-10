import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Store } from './infrastructure/persistence/typeorm/entities/store.entity';

@Module({ imports: [TypeOrmModule.forFeature([Store])], exports: [TypeOrmModule] })
export class StoresModule {}
