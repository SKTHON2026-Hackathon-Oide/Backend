import { Inject, Injectable, Optional } from '@nestjs/common';
import { SelectAnalysisBuildingCommand } from '../commands/select-analysis-building.command';
import { SpaceAnalysisContextResult } from '../results/space-analysis-context.result';
import {
  SPACE_ANALYSIS_CONTEXT_REPOSITORY,
  type SpaceAnalysisContextRepository,
} from '../../domain/ports/space-analysis-context.repository.port';
import {
  BUILDING_REGISTRY_LOADER,
  type BuildingRegistryLoader,
} from '../../domain/ports/building-registry-loader.port';
import { SpaceAnalysisContextStatus } from '../../domain/enums/space-analysis-context-status.enum';
import { SpaceAnalysisContextError } from '../../domain/services/space-analysis-context.error';

@Injectable()
export class SelectAnalysisBuildingUseCase {
  constructor(
    @Inject(SPACE_ANALYSIS_CONTEXT_REPOSITORY)
    private readonly contextRepository: SpaceAnalysisContextRepository,
    @Optional()
    @Inject(BUILDING_REGISTRY_LOADER)
    private readonly registryLoader?: BuildingRegistryLoader,
  ) {}

  async execute(
    command: SelectAnalysisBuildingCommand,
  ): Promise<SpaceAnalysisContextResult> {
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

    if (context.expiresAt.getTime() <= Date.now()) {
      context.status = SpaceAnalysisContextStatus.EXPIRED;
      context.updatedAt = new Date();
      await this.contextRepository.save(context);
      throw new SpaceAnalysisContextError(
        'CONTEXT_EXPIRED',
        '분석 컨텍스트가 만료되었습니다. 좌표를 다시 선택해 주세요.',
      );
    }

    if (
      [
        SpaceAnalysisContextStatus.ANALYZING,
        SpaceAnalysisContextStatus.COMPLETED,
        SpaceAnalysisContextStatus.FAILED,
        SpaceAnalysisContextStatus.EXPIRED,
      ].includes(context.status)
    ) {
      throw new SpaceAnalysisContextError(
        'CONTEXT_IMMUTABLE',
        '이미 분석이 시작되었거나 종료된 컨텍스트는 변경할 수 없습니다.',
      );
    }

    if (!context.candidateBuildingIds.includes(command.buildingId)) {
      throw new SpaceAnalysisContextError(
        'BUILDING_NOT_IN_CONTEXT',
        '처음 조회한 건물 후보에 포함되지 않은 건물입니다.',
      );
    }

    context.selectedBuildingId = command.buildingId;
    context.status = SpaceAnalysisContextStatus.BUILDING_SELECTED;
    context.updatedAt = new Date();
    let savedContext = await this.contextRepository.save(context);

    if (this.registryLoader) {
      context.status = SpaceAnalysisContextStatus.REGISTRY_LOADING;
      context.updatedAt = new Date();
      savedContext = await this.contextRepository.save(context);
      const registry = await this.registryLoader.execute(command.buildingId, {
        page: command.spaceOptionsPage,
        pageSize: command.spaceOptionsPageSize,
      });
      context.status = SpaceAnalysisContextStatus.DETAIL_SELECTION_REQUIRED;
      context.selectedRegistryCacheId = registry.cacheId;
      context.updatedAt = new Date();
      savedContext = await this.contextRepository.save(context);

      return {
        contextId: savedContext.id,
        status: savedContext.status,
        point: {
          longitude: Number(savedContext.longitude),
          latitude: Number(savedContext.latitude),
        },
        candidates: [],
        selectedBuildingId: savedContext.selectedBuildingId,
        expiresAt: savedContext.expiresAt.toISOString(),
        registry,
      };
    }

    return {
      contextId: savedContext.id,
      status: savedContext.status,
      point: {
        longitude: Number(savedContext.longitude),
        latitude: Number(savedContext.latitude),
      },
      candidates: [],
      selectedBuildingId: savedContext.selectedBuildingId,
      expiresAt: savedContext.expiresAt.toISOString(),
    };
  }
}
