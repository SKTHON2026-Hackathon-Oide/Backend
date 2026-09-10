import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AreaBusinessFeature } from './infrastructure/persistence/typeorm/entities/area-business-feature.entity';
import { CommercialArea } from './infrastructure/persistence/typeorm/entities/commercial-area.entity';
import { CommercialAreaBuilding } from './infrastructure/persistence/typeorm/entities/commercial-area-building.entity';
import { CommercialAreaFeature } from './infrastructure/persistence/typeorm/entities/commercial-area-feature.entity';
import { LandUseZone } from './infrastructure/persistence/typeorm/entities/land-use-zone.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CommercialArea,
      LandUseZone,
      CommercialAreaFeature,
      AreaBusinessFeature,
      CommercialAreaBuilding,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class CommercialAreasModule {}
