import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdministrativeArea } from './infrastructure/persistence/typeorm/entities/administrative-area.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AdministrativeArea])],
  exports: [TypeOrmModule],
})
export class AdministrativeAreasModule {}
