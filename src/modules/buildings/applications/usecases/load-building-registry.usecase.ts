import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { BuildingRegistryCache } from '../../infrastructure/persistence/typeorm/entities/building-registry-cache.entity';
import { BuildingRegistryStatus } from '../../domain/enums/building-registry-status.enum';
import {
  BUILDING_LOOKUP_PORT,
  type BuildingLookupPort,
} from '../../domain/ports/building-lookup.port';
import {
  BUILDING_REGISTRY_CACHE_REPOSITORY,
  type BuildingRegistryCacheRepository,
} from '../../domain/ports/building-registry-cache.repository.port';
import {
  BUILDING_REGISTRY_GATEWAY,
  type BuildingHubQuery,
  type BuildingRegistryGateway,
} from '../../domain/ports/building-registry.gateway.port';
import { PnuBuildingHubQueryFactory } from '../../domain/services/pnu-building-hub-query.factory';
import {
  BuildingLedgerMatchService,
  type LedgerMatchCandidate,
} from '../../domain/services/building-ledger-match.service';
import { RegistrySpaceOptionService } from '../../domain/services/registry-space-option.service';
import {
  BuildingRegistryResult,
  RegistryBuildingCandidate,
} from '../results/building-registry.result';
import { SpaceAnalysisContextError } from '../../domain/services/space-analysis-context.error';
import { BuildingHubClientError } from '../../infrastructure/external/building-hub/building-hub.types';

const CACHE_VERSION = 'building-hub-v4';
const CACHE_TTL_DAYS = 30;
const NOT_FOUND_TTL_DAYS = 1;
const MAX_AMBIGUOUS_CANDIDATES = 20;

@Injectable()
export class LoadBuildingRegistryUseCase {
  private readonly queryFactory = new PnuBuildingHubQueryFactory();
  private readonly matchService = new BuildingLedgerMatchService();
  private readonly optionService = new RegistrySpaceOptionService();

  constructor(
    @Inject(BUILDING_LOOKUP_PORT)
    private readonly buildingLookup: BuildingLookupPort,
    @Inject(BUILDING_REGISTRY_GATEWAY)
    private readonly gateway: BuildingRegistryGateway,
    @Inject(BUILDING_REGISTRY_CACHE_REPOSITORY)
    private readonly cacheRepository: BuildingRegistryCacheRepository,
  ) {}

  async execute(buildingId: string): Promise<BuildingRegistryResult> {
    const building = await this.buildingLookup.findById(buildingId);
    if (!building) {
      throw new SpaceAnalysisContextError(
        'BUILDING_NOT_IN_CONTEXT',
        '선택한 내부 건물을 찾을 수 없습니다.',
      );
    }

    if (!building.pnu) {
      return this.unavailable('PNU_UNAVAILABLE');
    }

    let query: BuildingHubQuery;
    try {
      query = this.queryFactory.create(building.pnu);
    } catch (error) {
      if (error instanceof SpaceAnalysisContextError) {
        return this.unavailable(error.code);
      }
      throw error;
    }

    const requestFingerprint = createHash('sha256')
      .update(`${CACHE_VERSION}:${building.pnu}`)
      .digest('hex');
    const now = new Date();
    const validCache = await this.cacheRepository.findLatestValid(
      buildingId,
      requestFingerprint,
      now,
    );
    if (validCache?.normalizedOptions) {
      return this.fromCache(validCache, false);
    }

    try {
      const raw = await this.gateway.fetchByParcel(query);
      const result = this.buildResult(building, raw);
      const existingCache = await this.cacheRepository.findLatest(
        buildingId,
        requestFingerprint,
      );
      const savedCache = await this.saveCache(
        building,
        requestFingerprint,
        result,
        raw.rawResponse,
        now,
        existingCache,
      );
      return { ...result, cacheId: savedCache.id };
    } catch (error) {
      const staleCache = await this.cacheRepository.findLatest(
        buildingId,
        requestFingerprint,
      );
      if (staleCache?.normalizedOptions) {
        return this.fromCache(staleCache, true);
      }
      return this.unavailable(this.errorCode(error));
    }
  }

  private buildResult(
    building: Awaited<
      ReturnType<BuildingLookupPort['findById']>
    > extends infer T
      ? Exclude<T, null>
      : never,
    raw: Awaited<ReturnType<BuildingRegistryGateway['fetchByParcel']>>,
  ): BuildingRegistryResult {
    if (raw.basis.length === 0) {
      return {
        registryStatus: BuildingRegistryStatus.REGISTRY_NOT_FOUND,
        ledgerMatch: null,
        ambiguousCandidates: [],
        housingPrice: null,
        spaceOptions: [],
        manualInputAllowed: true,
        isStale: false,
        errorCode: null,
        cacheId: null,
      };
    }

    const match = this.matchService.match(building, raw.basis);
    if (match.status === 'AMBIGUOUS') {
      return {
        registryStatus:
          BuildingRegistryStatus.REGISTRY_BUILDING_SELECTION_REQUIRED,
        ledgerMatch: null,
        ambiguousCandidates: this.toAmbiguousCandidates(match.candidates),
        housingPrice: null,
        spaceOptions: [],
        manualInputAllowed: true,
        isStale: false,
        errorCode: null,
        cacheId: null,
      };
    }

    if (match.status === 'NOT_FOUND' || !match.selected) {
      return {
        registryStatus: BuildingRegistryStatus.BUILDING_ONLY,
        ledgerMatch: null,
        ambiguousCandidates: [],
        housingPrice: null,
        spaceOptions: [],
        manualInputAllowed: true,
        isStale: false,
        errorCode: null,
        cacheId: null,
      };
    }

    const selected = match.selected;
    const registryKeys = new Set(
      selected.group.basisRecords
        .map((record) => record.mgmBldrgstPk)
        .filter((value): value is string => value !== null),
    );
    const areas =
      registryKeys.size === 0
        ? raw.areas
        : raw.areas.filter(
            (record) =>
              record.mgmBldrgstPk === null ||
              registryKeys.has(record.mgmBldrgstPk),
          );
    const floors =
      registryKeys.size === 0
        ? raw.floors
        : raw.floors.filter(
            (record) =>
              record.mgmBldrgstPk === null ||
              registryKeys.has(record.mgmBldrgstPk),
          );
    const spaceOptions = this.optionService.create(areas, floors);
    const housingPrice = this.housingPriceFor(raw.housingPrices, registryKeys);
    const registryStatus = spaceOptions.some(
      (option) => option.exclusiveAreaSqm !== null,
    )
      ? BuildingRegistryStatus.UNIT_OPTIONS_AVAILABLE
      : spaceOptions.length > 0
        ? BuildingRegistryStatus.FLOOR_OPTIONS_ONLY
        : BuildingRegistryStatus.BUILDING_ONLY;
    const sourceAsOf =
      selected.group.basisRecords
        .map((record) => record.sourceCreatedAt)
        .find((value) => value !== null) ?? null;

    return {
      registryStatus,
      ledgerMatch: {
        buildingName: selected.group.buildingName,
        address: selected.group.address,
        confidence: selected.score / 100,
        sourceAsOf,
      },
      ambiguousCandidates: [],
      housingPrice,
      spaceOptions,
      manualInputAllowed: true,
      isStale: false,
      errorCode: null,
      cacheId: null,
    };
  }

  private async saveCache(
    building: Exclude<
      Awaited<ReturnType<BuildingLookupPort['findById']>>,
      null
    >,
    requestFingerprint: string,
    result: BuildingRegistryResult,
    rawResponse: {
      basis: unknown;
      floors: unknown;
      areas: unknown;
      housingPrices: unknown;
    },
    now: Date,
    existingCache: BuildingRegistryCache | null,
  ): Promise<BuildingRegistryCache> {
    const cache = existingCache ?? new BuildingRegistryCache();
    cache.buildingId = building.buildingId;
    cache.pnu = building.pnu;
    cache.requestFingerprint = requestFingerprint;
    cache.status = result.registryStatus;
    cache.matchedMgmBldrgstPk = null;
    cache.matchConfidence = result.ledgerMatch?.confidence?.toFixed(4) ?? null;
    cache.normalizedOptions = result as unknown as Record<string, unknown>;
    cache.rawResponse = rawResponse;
    cache.sourceCreatedAt = result.ledgerMatch?.sourceAsOf ?? null;
    cache.fetchedAt = now;
    const ttlDays =
      result.registryStatus === BuildingRegistryStatus.REGISTRY_NOT_FOUND
        ? NOT_FOUND_TTL_DAYS
        : CACHE_TTL_DAYS;
    cache.expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
    cache.lastErrorCode = null;
    cache.createdAt = now;
    cache.updatedAt = now;
    return this.cacheRepository.save(cache);
  }

  private fromCache(
    cache: BuildingRegistryCache,
    isStale: boolean,
  ): BuildingRegistryResult {
    const result = cache.normalizedOptions as unknown as BuildingRegistryResult;
    return { ...result, cacheId: cache.id, isStale };
  }

  private unavailable(errorCode: string): BuildingRegistryResult {
    return {
      registryStatus: BuildingRegistryStatus.REGISTRY_UNAVAILABLE,
      ledgerMatch: null,
      ambiguousCandidates: [],
      housingPrice: null,
      spaceOptions: [],
      manualInputAllowed: true,
      isStale: false,
      errorCode,
      cacheId: null,
    };
  }

  private errorCode(error: unknown): string {
    return error instanceof BuildingHubClientError
      ? error.code
      : 'REGISTRY_UNAVAILABLE';
  }

  private housingPriceFor(
    records: Awaited<
      ReturnType<BuildingRegistryGateway['fetchByParcel']>
    >['housingPrices'],
    registryKeys: Set<string>,
  ): BuildingRegistryResult['housingPrice'] {
    const candidates = records
      .filter(
        (record) =>
          record.housingPrice !== null &&
          (registryKeys.size === 0 ||
            record.mgmBldrgstPk === null ||
            registryKeys.has(record.mgmBldrgstPk)),
      )
      .sort((left, right) =>
        (right.sourceCreatedAt ?? '').localeCompare(left.sourceCreatedAt ?? ''),
      );
    const latest = candidates[0];
    return latest
      ? {
          amount: latest.housingPrice as number,
          sourceAsOf: latest.sourceCreatedAt,
        }
      : null;
  }

  private toAmbiguousCandidates(
    candidates: LedgerMatchCandidate[],
  ): RegistryBuildingCandidate[] {
    return candidates.slice(0, MAX_AMBIGUOUS_CANDIDATES).map((candidate) => ({
      registryKey: candidate.group.registryKey,
      buildingName: candidate.group.buildingName,
      address: candidate.group.address,
      score: candidate.score,
      reasons: candidate.reasons,
    }));
  }
}
