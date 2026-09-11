import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Store } from './infrastructure/persistence/typeorm/entities/store.entity';
import { StoreCategoryMapping } from './infrastructure/persistence/typeorm/entities/store-category-mapping.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Store, StoreCategoryMapping])],
  exports: [TypeOrmModule],
})
export class StoresModule {}
