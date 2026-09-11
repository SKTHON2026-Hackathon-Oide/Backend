import { CreateSpaceAnalysisContextUseCase } from '../applications/usecases/create-space-analysis-context.usecase';
import { SelectAnalysisBuildingUseCase } from '../applications/usecases/select-analysis-building.usecase';
import {
  BuildingCandidate,
  BuildingSearchPort,
} from '../domain/ports/building-search.port';
import { SpaceAnalysisContextRepository } from '../domain/ports/space-analysis-context.repository.port';
import { SpaceAnalysisContext } from '../infrastructure/persistence/typeorm/entities/space-analysis-context.entity';
import { SpaceAnalysisContextStatus } from '../domain/enums/space-analysis-context-status.enum';
import { SpaceAnalysisContextError } from '../domain/services/space-analysis-context.error';
import { UserPresencePort } from '../../auth/domain/ports/user-presence.port';

const candidate = (buildingId: string): BuildingCandidate => ({
  buildingId,
  matchType: 'INTERSECTS',
  distanceMeters: 0,
  buildingName: '테스트 빌딩',
  jibunAddress: '서울특별시 테스트구 1-1',
  mainUseName: '제2종근린생활시설',
  buildingAreaSqm: 100,
  totalFloorAreaSqm: 500,
  groundFloorCount: 5,
  geometry: { type: 'MultiPolygon', coordinates: [] },
});

class FakeBuildingSearch implements BuildingSearchPort {
  inSeoul = true;
  candidates: BuildingCandidate[] = [candidate('101'), candidate('102')];

  isInSeoul(): Promise<boolean> {
    return Promise.resolve(this.inSeoul);
  }

  findCandidates(): Promise<BuildingCandidate[]> {
    return Promise.resolve(this.candidates);
  }
}

class FakeContextRepository implements SpaceAnalysisContextRepository {
  contexts = new Map<string, SpaceAnalysisContext>();

  create(context: SpaceAnalysisContext): Promise<SpaceAnalysisContext> {
    this.contexts.set(context.id, context);
    return Promise.resolve(context);
  }

  findOwnedById(
    contextId: string,
    userId: string,
  ): Promise<SpaceAnalysisContext | null> {
    const context = this.contexts.get(contextId);
    return Promise.resolve(context?.userId === userId ? context : null);
  }

  save(context: SpaceAnalysisContext): Promise<SpaceAnalysisContext> {
    this.contexts.set(context.id, context);
    return Promise.resolve(context);
  }
}

class FakeUserPresence implements UserPresencePort {
  exists = true;

  existsActiveUser(): Promise<boolean> {
    return Promise.resolve(this.exists);
  }
}

describe('space analysis context use cases', () => {
  let buildingSearch: FakeBuildingSearch;
  let contexts: FakeContextRepository;
  let users: FakeUserPresence;
  let createContext: CreateSpaceAnalysisContextUseCase;

  beforeEach(() => {
    buildingSearch = new FakeBuildingSearch();
    contexts = new FakeContextRepository();
    users = new FakeUserPresence();
    createContext = new CreateSpaceAnalysisContextUseCase(
      buildingSearch,
      contexts,
      users,
    );
  });

  it('creates a point-resolved context with exact building candidates', async () => {
    const result = await createContext.execute({
      userId: '7',
      longitude: 127.0365,
      latitude: 37.5442,
    });

    expect(result.status).toBe(SpaceAnalysisContextStatus.POINT_RESOLVED);
    expect(result.candidates.map((item) => item.buildingId)).toEqual([
      '101',
      '102',
    ]);
    expect(result.point).toEqual({ longitude: 127.0365, latitude: 37.5442 });
  });

  it('rejects invalid coordinates before querying the search port', async () => {
    await expect(
      createContext.execute({ userId: '7', longitude: 181, latitude: 37 }),
    ).rejects.toMatchObject({ code: 'INVALID_COORDINATE' });
  });

  it('returns a client-safe error when the authenticated user is absent', async () => {
    users.exists = false;

    await expect(
      createContext.execute({
        userId: '123',
        longitude: 127.0365,
        latitude: 37.5442,
      }),
    ).rejects.toMatchObject({
      code: 'AUTHENTICATED_USER_NOT_FOUND',
      status: 401,
    });
  });

  it('returns service-area and no-building errors distinctly', async () => {
    buildingSearch.inSeoul = false;
    await expect(
      createContext.execute({
        userId: '7',
        longitude: 126.9,
        latitude: 37.5,
      }),
    ).rejects.toMatchObject({ code: 'OUT_OF_SERVICE_AREA' });

    buildingSearch.inSeoul = true;
    buildingSearch.candidates = [];
    await expect(
      createContext.execute({
        userId: '7',
        longitude: 127,
        latitude: 37.5,
      }),
    ).rejects.toMatchObject({ code: 'NO_BUILDING_NEAR_POINT' });
  });

  it('only allows selecting a building from the original candidate set', async () => {
    const created = await createContext.execute({
      userId: '7',
      longitude: 127.0365,
      latitude: 37.5442,
    });
    const selectBuilding = new SelectAnalysisBuildingUseCase(contexts);

    await expect(
      selectBuilding.execute({
        userId: '7',
        contextId: created.contextId,
        buildingId: '999',
      }),
    ).rejects.toMatchObject({ code: 'BUILDING_NOT_IN_CONTEXT' });

    const result = await selectBuilding.execute({
      userId: '7',
      contextId: created.contextId,
      buildingId: '101',
    });
    expect(result.status).toBe(SpaceAnalysisContextStatus.BUILDING_SELECTED);
    expect(result.selectedBuildingId).toBe('101');
  });

  it('does not allow another user to select a context', async () => {
    const created = await createContext.execute({
      userId: '7',
      longitude: 127.0365,
      latitude: 37.5442,
    });
    const selectBuilding = new SelectAnalysisBuildingUseCase(contexts);

    await expect(
      selectBuilding.execute({
        userId: '8',
        contextId: created.contextId,
        buildingId: '101',
      }),
    ).rejects.toMatchObject({ code: 'CONTEXT_NOT_FOUND' });
  });

  it('marks an expired context and rejects mutation', async () => {
    const created = await createContext.execute({
      userId: '7',
      longitude: 127.0365,
      latitude: 37.5442,
    });
    const context = contexts.contexts.get(created.contextId);
    if (!context) throw new Error('test context was not created');
    context.expiresAt = new Date(Date.now() - 1);
    const selectBuilding = new SelectAnalysisBuildingUseCase(contexts);

    await expect(
      selectBuilding.execute({
        userId: '7',
        contextId: created.contextId,
        buildingId: '101',
      }),
    ).rejects.toBeInstanceOf(SpaceAnalysisContextError);
    expect(context.status).toBe(SpaceAnalysisContextStatus.EXPIRED);
  });
});
