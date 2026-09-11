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
import {
  RegistrySpaceOptionService,
  type RegistrySpaceOption,
} from '../../domain/services/registry-space-option.service';
import {
  BuildingRegistryResult,
  RegistryBuildingCandidate,
} from '../results/building-registry.result';
import { SpaceAnalysisContextError } from '../../domain/services/space-analysis-context.error';
import { BuildingHubClientError } from '../../infrastructure/external/building-hub/building-hub.types';

const CACHE_VERSION = 'building-hub-v6';
const CACHE_TTL_DAYS = 30;
const NOT_FOUND_TTL_DAYS = 1;
const MAX_REGISTRY_GROUPS = 20;
const DEFAULT_PAGE_SIZE = 100;

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

  async execute(
    buildingId: string,
    pagination: { page?: number; pageSize?: number } = {},
  ): Promise<BuildingRegistryResult> {
    const building = await this.buildingLookup.findById(buildingId);
    if (!building) {
      throw new SpaceAnalysisContextError(
        'BUILDING_NOT_IN_CONTEXT',
        '선택한 내부 건물을 찾을 수 없습니다.',
      );
    }

    if (!building.pnu) {
      return this.paginate(this.unavailable('PNU_UNAVAILABLE'), pagination);
    }

    let query: BuildingHubQuery;
    try {
      query = this.queryFactory.create(building.pnu);
    } catch (error) {
      if (error instanceof SpaceAnalysisContextError) {
        return this.paginate(this.unavailable(error.code), pagination);
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
      return this.paginate(this.fromCache(validCache, false), pagination);
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
      return this.paginate({ ...result, cacheId: savedCache.id }, pagination);
    } catch (error) {
      const staleCache = await this.cacheRepository.findLatest(
        buildingId,
        requestFingerprint,
      );
      if (staleCache?.normalizedOptions) {
        return this.paginate(this.fromCache(staleCache, true), pagination);
      }
      return this.paginate(this.unavailable(this.errorCode(error)), pagination);
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
        spaceOptionsPage: this.pageInfo(0, 1, DEFAULT_PAGE_SIZE),
        manualInputAllowed: true,
        isStale: false,
        errorCode: null,
        cacheId: null,
      };
    }

    const match = this.matchService.match(building, raw.basis);
    if (match.status === 'AMBIGUOUS') {
      const groups = this.ambiguousGroups(match.candidates);
      const optionsByGroup = new Map(
        groups.map((group) => [
          group.registryGroupKey,
          this.spaceOptionsFor(
            raw,
            new Set(group.registryKeys),
            group.registryGroupKey,
            this.dongNameFrom(building.buildingName),
          ),
        ]),
      );
      const spaceOptions = [...optionsByGroup.values()].flat();
      return {
        registryStatus: this.statusForOptions(spaceOptions),
        ledgerMatch: null,
        ambiguousCandidates: groups.map((group) => ({
          ...group,
          registryKeys: this.registryKeysFrom(
            optionsByGroup.get(group.registryGroupKey) ?? [],
          ),
          spaceOptionCount:
            optionsByGroup.get(group.registryGroupKey)?.length ?? 0,
        })),
        housingPrice: null,
        spaceOptions,
        spaceOptionsPage: this.pageInfo(
          spaceOptions.length,
          1,
          DEFAULT_PAGE_SIZE,
        ),
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
        spaceOptionsPage: this.pageInfo(0, 1, DEFAULT_PAGE_SIZE),
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
    const spaceOptions = this.spaceOptionsFor(
      raw,
      registryKeys,
      null,
      this.dongNameFrom(building.buildingName),
    );
    const housingPrice = this.housingPriceFor(raw.housingPrices, registryKeys);
    const registryStatus = this.statusForOptions(spaceOptions);
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
      spaceOptionsPage: this.pageInfo(
        spaceOptions.length,
        1,
        DEFAULT_PAGE_SIZE,
      ),
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
      spaceOptionsPage: this.pageInfo(0, 1, DEFAULT_PAGE_SIZE),
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

  private ambiguousGroups(
    candidates: LedgerMatchCandidate[],
  ): RegistryBuildingCandidate[] {
    const groups = new Map<
      string,
      RegistryBuildingCandidate & { keys: Set<string> }
    >();
    for (const candidate of candidates) {
      const identity = `${this.normalize(candidate.group.buildingName)}|${this.normalize(candidate.group.address)}`;
      const current = groups.get(identity);
      if (current) {
        current.keys.add(candidate.group.registryKey);
        continue;
      }
      const registryGroupKey = `grp_${createHash('sha256')
        .update(identity)
        .digest('hex')
        .slice(0, 20)}`;
      groups.set(identity, {
        registryGroupKey,
        registryKeys: [],
        keys: new Set([candidate.group.registryKey]),
        buildingName: candidate.group.buildingName,
        address: candidate.group.address,
        score: candidate.score,
        reasons: candidate.reasons,
        spaceOptionCount: 0,
      });
    }

    return [...groups.values()]
      .sort((left, right) => right.score - left.score)
      .slice(0, MAX_REGISTRY_GROUPS)
      .map(({ keys, ...group }) => ({
        ...group,
        registryKeys: [...keys],
      }));
  }

  private spaceOptionsFor(
    raw: Awaited<ReturnType<BuildingRegistryGateway['fetchByParcel']>>,
    registryKeys: Set<string>,
    registryGroupKey: string | null,
    dongName: string | null,
  ): RegistrySpaceOption[] {
    const includesKey = (value: string | null) =>
      registryKeys.size === 0 || value === null || registryKeys.has(value);
    const includesDong = (value: string | null) =>
      dongName === null || this.normalizeDongName(value) === dongName;
    return this.optionService
      .create(
        raw.areas.filter(
          (record) =>
            includesKey(record.mgmBldrgstPk) && includesDong(record.dongName),
        ),
        raw.floors.filter(
          (record) =>
            includesKey(record.mgmBldrgstPk) && includesDong(record.dongName),
        ),
      )
      .map((option) => ({ ...option, registryGroupKey }));
  }

  private statusForOptions(
    options: RegistrySpaceOption[],
  ): BuildingRegistryStatus {
    return options.some((option) => option.exclusiveAreaSqm !== null)
      ? BuildingRegistryStatus.UNIT_OPTIONS_AVAILABLE
      : options.length > 0
        ? BuildingRegistryStatus.FLOOR_OPTIONS_ONLY
        : BuildingRegistryStatus.BUILDING_ONLY;
  }

  private paginate(
    result: BuildingRegistryResult,
    pagination: { page?: number; pageSize?: number },
  ): BuildingRegistryResult {
    const page = Math.max(1, pagination.page ?? 1);
    const pageSize = Math.min(
      100,
      Math.max(1, pagination.pageSize ?? DEFAULT_PAGE_SIZE),
    );
    const totalItems = result.spaceOptions.length;
    const start = (page - 1) * pageSize;
    return {
      ...result,
      spaceOptions: result.spaceOptions.slice(start, start + pageSize),
      spaceOptionsPage: this.pageInfo(totalItems, page, pageSize),
    };
  }

  private pageInfo(totalItems: number, page: number, pageSize: number) {
    return {
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    };
  }

  private normalize(value: string | null): string {
    return (value ?? '').replace(/\s+/g, '').toLocaleLowerCase('ko-KR');
  }

  private dongNameFrom(buildingName: string | null): string | null {
    const match = buildingName?.match(/(?:^|\s)(\d+)\s*동(?:\s|$)/);
    return match ? `${match[1]}동` : null;
  }

  private normalizeDongName(value: string | null): string | null {
    const match = value?.match(/(\d+)\s*동/);
    return match ? `${match[1]}동` : null;
  }

  private registryKeysFrom(options: RegistrySpaceOption[]): string[] {
    return [
      ...new Set(
        options
          .map((option) => option.registryKey)
          .filter((value): value is string => value !== null),
      ),
    ];
  }
}
