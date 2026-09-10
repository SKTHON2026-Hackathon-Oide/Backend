import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FloatingPopulationGrid } from './infrastructure/persistence/typeorm/entities/floating-population-grid.entity';
import { FloatingPopulationStatistic } from './infrastructure/persistence/typeorm/entities/floating-population-statistic.entity';
import { RentStatistic } from './infrastructure/persistence/typeorm/entities/rent-statistic.entity';
import { SalesStatistic } from './infrastructure/persistence/typeorm/entities/sales-statistic.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SalesStatistic,
      FloatingPopulationGrid,
      FloatingPopulationStatistic,
      RentStatistic,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class AnalyticsModule {}
