import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Building } from './infrastructure/persistence/typeorm/entities/building.entity';
import { GisBuilding } from './infrastructure/persistence/typeorm/entities/gis-building.entity';
import { GisDatasetImport } from './infrastructure/persistence/typeorm/entities/gis-dataset-import.entity';
import { SpaceAnalysisContext } from './infrastructure/persistence/typeorm/entities/space-analysis-context.entity';
import { BuildingRegistryCache } from './infrastructure/persistence/typeorm/entities/building-registry-cache.entity';
import { SpaceAnalysisContextController } from './interfaces/http/space-analysis-context.controller';
import { CreateSpaceAnalysisContextUseCase } from './applications/usecases/create-space-analysis-context.usecase';
import { SelectAnalysisBuildingUseCase } from './applications/usecases/select-analysis-building.usecase';
import { BUILDING_SEARCH_PORT } from './domain/ports/building-search.port';
import { SPACE_ANALYSIS_CONTEXT_REPOSITORY } from './domain/ports/space-analysis-context.repository.port';
import { TypeOrmBuildingSearchRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-building-search.repository';
import { TypeOrmSpaceAnalysisContextRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-space-analysis-context.repository';
import { TypeOrmBuildingLookupRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-building-lookup.repository';
import { TypeOrmBuildingRegistryCacheRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-building-registry-cache.repository';
import { BuildingHubClient } from './infrastructure/external/building-hub/building-hub.client';
import { LoadBuildingRegistryUseCase } from './applications/usecases/load-building-registry.usecase';
import { SelectSpaceDetailUseCase } from './applications/usecases/select-space-detail.usecase';
import { BUILDING_LOOKUP_PORT } from './domain/ports/building-lookup.port';
import { BUILDING_REGISTRY_GATEWAY } from './domain/ports/building-registry.gateway.port';
import { BUILDING_REGISTRY_CACHE_REPOSITORY } from './domain/ports/building-registry-cache.repository.port';
import { BUILDING_REGISTRY_LOADER } from './domain/ports/building-registry-loader.port';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Building,
      GisBuilding,
      GisDatasetImport,
      SpaceAnalysisContext,
      BuildingRegistryCache,
    ]),
  ],
  controllers: [SpaceAnalysisContextController],
  providers: [
    CreateSpaceAnalysisContextUseCase,
    SelectAnalysisBuildingUseCase,
    LoadBuildingRegistryUseCase,
    SelectSpaceDetailUseCase,
    TypeOrmBuildingSearchRepository,
    TypeOrmSpaceAnalysisContextRepository,
    TypeOrmBuildingLookupRepository,
    TypeOrmBuildingRegistryCacheRepository,
    BuildingHubClient,
    {
      provide: BUILDING_SEARCH_PORT,
      useExisting: TypeOrmBuildingSearchRepository,
    },
    {
      provide: SPACE_ANALYSIS_CONTEXT_REPOSITORY,
      useExisting: TypeOrmSpaceAnalysisContextRepository,
    },
    {
      provide: BUILDING_LOOKUP_PORT,
      useExisting: TypeOrmBuildingLookupRepository,
    },
    {
      provide: BUILDING_REGISTRY_GATEWAY,
      useExisting: BuildingHubClient,
    },
    {
      provide: BUILDING_REGISTRY_CACHE_REPOSITORY,
      useExisting: TypeOrmBuildingRegistryCacheRepository,
    },
    {
      provide: BUILDING_REGISTRY_LOADER,
      useExisting: LoadBuildingRegistryUseCase,
    },
  ],
  exports: [TypeOrmModule],
})
export class BuildingsModule {}
