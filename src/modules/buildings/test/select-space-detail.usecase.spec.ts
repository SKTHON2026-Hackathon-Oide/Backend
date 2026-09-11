import { SelectSpaceDetailUseCase } from '../applications/usecases/select-space-detail.usecase';
import { SpaceAnalysisContextStatus } from '../domain/enums/space-analysis-context-status.enum';
import { SpaceAnalysisMode } from '../domain/enums/space-analysis-mode.enum';
import { SpaceDetailSource } from '../domain/enums/space-detail-source.enum';
import { SpaceAnalysisContext } from '../infrastructure/persistence/typeorm/entities/space-analysis-context.entity';
import { BuildingRegistryCache } from '../infrastructure/persistence/typeorm/entities/building-registry-cache.entity';
import { SpaceAnalysisContextRepository } from '../domain/ports/space-analysis-context.repository.port';
import { BuildingRegistryCacheRepository } from '../domain/ports/building-registry-cache.repository.port';

class FakeContextRepository implements SpaceAnalysisContextRepository {
  context: SpaceAnalysisContext;

  constructor() {
    this.context = new SpaceAnalysisContext();
    this.context.id = 'context';
    this.context.userId = '7';
    this.context.selectedBuildingId = '101';
    this.context.status = SpaceAnalysisContextStatus.DETAIL_SELECTION_REQUIRED;
    this.context.expiresAt = new Date(Date.now() + 60_000);
    this.context.selectedSpaceDetail = null;
    this.context.analysisMode = null;
  }

  create(context: SpaceAnalysisContext): Promise<SpaceAnalysisContext> {
    this.context = context;
    return Promise.resolve(context);
  }

  findOwnedById(
    contextId: string,
    userId: string,
  ): Promise<SpaceAnalysisContext | null> {
    return Promise.resolve(
      this.context.id === contextId && this.context.userId === userId
        ? this.context
        : null,
    );
  }

  save(context: SpaceAnalysisContext): Promise<SpaceAnalysisContext> {
    this.context = context;
    return Promise.resolve(context);
  }
}

class FakeCacheRepository implements BuildingRegistryCacheRepository {
  cache = new BuildingRegistryCache();

  constructor() {
    this.cache.id = 'cache';
    this.cache.buildingId = '101';
    this.cache.expiresAt = new Date(Date.now() + 60_000);
    this.cache.normalizedOptions = {
      registryStatus: 'UNIT_OPTIONS_AVAILABLE',
      spaceOptions: [
        {
          optionId: 'opt_1',
          floor: 1,
          floorName: '지상 1층',
          unitName: '101호',
          exclusiveAreaSqm: 59.72,
          commonAreaSqm: 13.41,
          floorAreaSqm: null,
          registeredUseCode: '1000',
          registeredUseName: '일반음식점',
          areaSource: 'BUILDING_HUB_EXCLUSIVE_AREA',
        },
      ],
    };
  }

  findById(cacheId: string): Promise<BuildingRegistryCache | null> {
    return Promise.resolve(cacheId === this.cache.id ? this.cache : null);
  }

  findLatestValid(): Promise<BuildingRegistryCache | null> {
    return Promise.resolve(null);
  }

  findLatest(): Promise<BuildingRegistryCache | null> {
    return Promise.resolve(null);
  }

  save(cache: BuildingRegistryCache): Promise<BuildingRegistryCache> {
    this.cache = cache;
    return Promise.resolve(cache);
  }
}

describe('select space detail use case', () => {
  it('re-reads a BuildingHUB option from the server cache', async () => {
    const contexts = new FakeContextRepository();
    contexts.context.selectedRegistryCacheId = 'cache';
    const useCase = new SelectSpaceDetailUseCase(
      contexts,
      new FakeCacheRepository(),
    );

    const result = await useCase.execute({
      userId: '7',
      contextId: 'context',
      source: SpaceDetailSource.BUILDING_HUB,
      optionId: 'opt_1',
      monthlyRentKrw: 2_500_000,
    });

    expect(result.analysisMode).toBe(SpaceAnalysisMode.SPACE_DETAIL);
    expect(result.selectedSpaceDetail?.exclusiveAreaSqm).toBe(59.72);
    expect(result.selectedSpaceDetail?.monthlyRentKrw).toBe(2_500_000);
  });

  it('supports manual input and location-only fallback', async () => {
    const contexts = new FakeContextRepository();
    const useCase = new SelectSpaceDetailUseCase(
      contexts,
      new FakeCacheRepository(),
    );

    const detail = await useCase.execute({
      userId: '7',
      contextId: 'context',
      source: SpaceDetailSource.USER_INPUT,
      floor: 2,
      exclusiveAreaSqm: 42.5,
    });
    expect(detail.analysisMode).toBe(SpaceAnalysisMode.SPACE_DETAIL);

    const skipped = await useCase.skip('context', '7');
    expect(skipped.analysisMode).toBe(SpaceAnalysisMode.LOCATION_ONLY);
    expect(skipped.status).toBe(SpaceAnalysisContextStatus.LOCATION_ONLY_READY);
  });

  it('rejects a floor-only cache option for detailed analysis', async () => {
    const contexts = new FakeContextRepository();
    contexts.context.selectedRegistryCacheId = 'cache';
    const cache = new FakeCacheRepository();
    cache.cache.normalizedOptions = {
      spaceOptions: [
        {
          optionId: 'floor_1',
          floor: 1,
          floorName: '지상 1층',
          unitName: null,
          exclusiveAreaSqm: null,
          commonAreaSqm: null,
          floorAreaSqm: 120,
          registeredUseCode: null,
          registeredUseName: null,
          areaSource: 'BUILDING_HUB_FLOOR_AREA',
        },
      ],
    };
    const useCase = new SelectSpaceDetailUseCase(contexts, cache);

    await expect(
      useCase.execute({
        userId: '7',
        contextId: 'context',
        source: SpaceDetailSource.BUILDING_HUB,
        optionId: 'floor_1',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SPACE_DETAIL' });
  });
});
