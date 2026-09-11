import { Inject, Injectable } from '@nestjs/common';
import { SelectSpaceDetailCommand } from '../commands/select-space-detail.command';
import { SpaceDetailResult } from '../results/space-detail.result';
import {
  BUILDING_REGISTRY_CACHE_REPOSITORY,
  type BuildingRegistryCacheRepository,
} from '../../domain/ports/building-registry-cache.repository.port';
import {
  SPACE_ANALYSIS_CONTEXT_REPOSITORY,
  type SpaceAnalysisContextRepository,
} from '../../domain/ports/space-analysis-context.repository.port';
import { SpaceAnalysisContextStatus } from '../../domain/enums/space-analysis-context-status.enum';
import { SpaceAnalysisMode } from '../../domain/enums/space-analysis-mode.enum';
import { SpaceDetailSource } from '../../domain/enums/space-detail-source.enum';
import { SpaceAnalysisContextError } from '../../domain/services/space-analysis-context.error';
import { BuildingRegistryResult } from '../results/building-registry.result';
import { SpaceAnalysisContext } from '../../infrastructure/persistence/typeorm/entities/space-analysis-context.entity';

interface CachedSpaceOption {
  optionId: string;
  floor: number | null;
  floorName: string | null;
  unitName: string | null;
  exclusiveAreaSqm: number | null;
  commonAreaSqm: number | null;
  floorAreaSqm: number | null;
  registeredUseCode: string | null;
  registeredUseName: string | null;
  areaSource: string;
}

type SelectedSpaceDetail = Record<string, unknown> & {
  floor: number | null;
  exclusiveAreaSqm: number | null;
};

@Injectable()
export class SelectSpaceDetailUseCase {
  constructor(
    @Inject(SPACE_ANALYSIS_CONTEXT_REPOSITORY)
    private readonly contextRepository: SpaceAnalysisContextRepository,
    @Inject(BUILDING_REGISTRY_CACHE_REPOSITORY)
    private readonly cacheRepository: BuildingRegistryCacheRepository,
  ) {}

  async execute(command: SelectSpaceDetailCommand): Promise<SpaceDetailResult> {
    const context = await this.contextRepository.findOwnedById(
      command.contextId,
      command.userId,
    );
    if (!context) {
      throw new SpaceAnalysisContextError(
        'CONTEXT_NOT_FOUND',
        '분석 컨텍스트를 찾을 수 없습니다.',
      );
    }
    this.ensureMutable(context.status);
    if (!context.selectedBuildingId) {
      throw new SpaceAnalysisContextError(
        'INVALID_SPACE_DETAIL',
        '먼저 분석 대상 건물을 선택해야 합니다.',
      );
    }
    await this.ensureNotExpired(context);

    const selectedDetail =
      command.source === SpaceDetailSource.BUILDING_HUB
        ? await this.fromBuildingHubOption(
            context.selectedRegistryCacheId,
            context.selectedBuildingId,
            command,
          )
        : this.fromUserInput(command);

    if (
      selectedDetail.floor === null ||
      selectedDetail.exclusiveAreaSqm === null
    ) {
      throw new SpaceAnalysisContextError(
        'INVALID_SPACE_DETAIL',
        '상세 분석에는 유효한 층과 전용면적이 필요합니다.',
      );
    }

    context.selectedSpaceDetail = selectedDetail;
    context.analysisMode = SpaceAnalysisMode.SPACE_DETAIL;
    context.status = SpaceAnalysisContextStatus.SPACE_DETAIL_READY;
    context.updatedAt = new Date();
    const saved = await this.contextRepository.save(context);
    return this.toResult(saved);
  }

  async skip(contextId: string, userId: string): Promise<SpaceDetailResult> {
    const context = await this.contextRepository.findOwnedById(
      contextId,
      userId,
    );
    if (!context) {
      throw new SpaceAnalysisContextError(
        'CONTEXT_NOT_FOUND',
        '분석 컨텍스트를 찾을 수 없습니다.',
      );
    }
    this.ensureMutable(context.status);
    await this.ensureNotExpired(context);
    if (!context.selectedBuildingId) {
      throw new SpaceAnalysisContextError(
        'INVALID_SPACE_DETAIL',
        '먼저 분석 대상 건물을 선택해야 합니다.',
      );
    }

    context.selectedSpaceDetail = null;
    context.analysisMode = SpaceAnalysisMode.LOCATION_ONLY;
    context.status = SpaceAnalysisContextStatus.LOCATION_ONLY_READY;
    context.updatedAt = new Date();
    const saved = await this.contextRepository.save(context);
    return this.toResult(saved);
  }

  private async fromBuildingHubOption(
    cacheId: string | null,
    selectedBuildingId: string,
    command: SelectSpaceDetailCommand,
  ): Promise<SelectedSpaceDetail> {
    if (!cacheId || !command.optionId) {
      throw new SpaceAnalysisContextError(
        'INVALID_SPACE_DETAIL',
        '건축물대장 옵션을 다시 선택해 주세요.',
      );
    }
    const cache = await this.cacheRepository.findById(cacheId);
    const cachedResult =
      cache?.normalizedOptions as BuildingRegistryResult | null;
    if (
      !cache ||
      cache.buildingId !== selectedBuildingId ||
      !cachedResult ||
      cache.expiresAt.getTime() <= Date.now()
    ) {
      throw new SpaceAnalysisContextError(
        'INVALID_SPACE_DETAIL',
        '건축물대장 옵션 캐시가 만료되었습니다. 다시 조회해 주세요.',
      );
    }
    const option = cachedResult.spaceOptions.find(
      (item) => item.optionId === command.optionId,
    ) as CachedSpaceOption | undefined;
    if (!option) {
      throw new SpaceAnalysisContextError(
        'INVALID_SPACE_DETAIL',
        '유효하지 않은 건축물대장 옵션입니다.',
      );
    }
    return {
      source: SpaceDetailSource.BUILDING_HUB,
      optionId: option.optionId,
      floor: option.floor,
      floorName: option.floorName,
      unitName: option.unitName,
      exclusiveAreaSqm: option.exclusiveAreaSqm,
      commonAreaSqm: option.commonAreaSqm,
      floorAreaSqm: option.floorAreaSqm,
      registeredUseCode: option.registeredUseCode,
      registeredUseName: option.registeredUseName,
      areaSource: option.areaSource,
      depositKrw: command.depositKrw ?? null,
      monthlyRentKrw: command.monthlyRentKrw ?? null,
      maintenanceFeeKrw: command.maintenanceFeeKrw ?? null,
      parking: command.parking ?? 'UNKNOWN',
      streetVisibility: command.streetVisibility ?? 'UNKNOWN',
      walkAccess: command.walkAccess ?? 'UNKNOWN',
    };
  }

  private fromUserInput(
    command: SelectSpaceDetailCommand,
  ): SelectedSpaceDetail {
    if (
      command.floor === undefined ||
      !Number.isInteger(command.floor) ||
      command.exclusiveAreaSqm === undefined ||
      !Number.isFinite(command.exclusiveAreaSqm) ||
      command.exclusiveAreaSqm <= 0
    ) {
      throw new SpaceAnalysisContextError(
        'INVALID_SPACE_DETAIL',
        '수동 입력에는 정수 층과 0보다 큰 전용면적이 필요합니다.',
      );
    }
    return {
      source: SpaceDetailSource.USER_INPUT,
      floor: command.floor,
      exclusiveAreaSqm: command.exclusiveAreaSqm,
      depositKrw: command.depositKrw ?? null,
      monthlyRentKrw: command.monthlyRentKrw ?? null,
      maintenanceFeeKrw: command.maintenanceFeeKrw ?? null,
      parking: command.parking ?? 'UNKNOWN',
      streetVisibility: command.streetVisibility ?? 'UNKNOWN',
      walkAccess: command.walkAccess ?? 'UNKNOWN',
    };
  }

  private ensureMutable(status: SpaceAnalysisContextStatus): void {
    if (
      [
        SpaceAnalysisContextStatus.ANALYZING,
        SpaceAnalysisContextStatus.COMPLETED,
        SpaceAnalysisContextStatus.FAILED,
        SpaceAnalysisContextStatus.EXPIRED,
      ].includes(status)
    ) {
      throw new SpaceAnalysisContextError(
        'CONTEXT_IMMUTABLE',
        '이미 분석이 시작되었거나 종료된 컨텍스트는 변경할 수 없습니다.',
      );
    }
  }

  private async ensureNotExpired(context: SpaceAnalysisContext): Promise<void> {
    if (context.expiresAt.getTime() <= Date.now()) {
      context.status = SpaceAnalysisContextStatus.EXPIRED;
      context.updatedAt = new Date();
      await this.contextRepository.save(context);
      throw new SpaceAnalysisContextError(
        'CONTEXT_EXPIRED',
        '분석 컨텍스트가 만료되었습니다. 좌표를 다시 선택해 주세요.',
      );
    }
  }

  private toResult(context: {
    id: string;
    status: SpaceAnalysisContextStatus;
    analysisMode: SpaceAnalysisMode | null;
    selectedSpaceDetail: Record<string, unknown> | null;
    selectedBuildingId: string | null;
    expiresAt: Date;
  }): SpaceDetailResult {
    return {
      contextId: context.id,
      status: context.status,
      analysisMode: context.analysisMode ?? SpaceAnalysisMode.LOCATION_ONLY,
      source:
        (context.selectedSpaceDetail?.source as SpaceDetailSource) ?? null,
      selectedSpaceDetail: context.selectedSpaceDetail,
      selectedBuildingId: context.selectedBuildingId,
      expiresAt: context.expiresAt.toISOString(),
    };
  }
}
