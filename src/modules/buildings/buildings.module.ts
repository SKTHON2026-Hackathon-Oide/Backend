import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Building } from './infrastructure/persistence/typeorm/entities/building.entity';
import { GisBuilding } from './infrastructure/persistence/typeorm/entities/gis-building.entity';
import { GisDatasetImport } from './infrastructure/persistence/typeorm/entities/gis-dataset-import.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Building, GisBuilding, GisDatasetImport])],
  exports: [TypeOrmModule],
})
export class BuildingsModule {}
