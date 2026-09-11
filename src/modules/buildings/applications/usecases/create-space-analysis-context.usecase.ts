import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CreateSpaceAnalysisContextCommand } from '../commands/create-space-analysis-context.command';
import { SpaceAnalysisContextResult } from '../results/space-analysis-context.result';
import {
  BUILDING_SEARCH_PORT,
  type BuildingCandidate,
  type BuildingSearchPort,
} from '../../domain/ports/building-search.port';
import {
  SPACE_ANALYSIS_CONTEXT_REPOSITORY,
  type SpaceAnalysisContextRepository,
} from '../../domain/ports/space-analysis-context.repository.port';
import { SpaceAnalysisContext } from '../../infrastructure/persistence/typeorm/entities/space-analysis-context.entity';
import { SpaceAnalysisContextStatus } from '../../domain/enums/space-analysis-context-status.enum';
import { SpaceAnalysisContextError } from '../../domain/services/space-analysis-context.error';
import {
  USER_PRESENCE_PORT,
  type UserPresencePort,
} from '../../../auth/domain/ports/user-presence.port';

const MAX_BUILDING_CANDIDATES = 20;
const CONTEXT_TTL_HOURS = 24;

@Injectable()
export class CreateSpaceAnalysisContextUseCase {
  constructor(
    @Inject(BUILDING_SEARCH_PORT)
    private readonly buildingSearch: BuildingSearchPort,
    @Inject(SPACE_ANALYSIS_CONTEXT_REPOSITORY)
    private readonly contextRepository: SpaceAnalysisContextRepository,
    @Inject(USER_PRESENCE_PORT)
    private readonly userPresence: UserPresencePort,
  ) {}

  async execute(
    command: CreateSpaceAnalysisContextCommand,
  ): Promise<SpaceAnalysisContextResult> {
    this.validateCoordinate(command.longitude, command.latitude);

    if (!(await this.userPresence.existsActiveUser(command.userId))) {
      throw new SpaceAnalysisContextError(
        'AUTHENTICATED_USER_NOT_FOUND',
        '인증된 사용자를 찾을 수 없습니다. users 테이블 동기화 후 다시 시도해 주세요.',
      );
    }

    const point = {
      longitude: command.longitude,
      latitude: command.latitude,
    };
    if (!(await this.buildingSearch.isInSeoul(point))) {
      throw new SpaceAnalysisContextError(
        'OUT_OF_SERVICE_AREA',
        '분석 가능한 서울 서비스 범위 밖의 좌표입니다.',
      );
    }

    const candidates = await this.buildingSearch.findCandidates(
      point,
      MAX_BUILDING_CANDIDATES,
    );
    if (candidates.length === 0) {
      throw new SpaceAnalysisContextError(
        'NO_BUILDING_NEAR_POINT',
        '좌표에서 10m 이내에 분석 가능한 건물이 없습니다.',
      );
    }

    const now = new Date();
    const context = new SpaceAnalysisContext();
    context.id = randomUUID();
    context.userId = command.userId;
    context.longitude = command.longitude.toFixed(7);
    context.latitude = command.latitude.toFixed(7);
    context.candidateBuildingIds = candidates.map(
      (candidate) => candidate.buildingId,
    );
    context.selectedBuildingId = null;
    context.selectedRegistryCacheId = null;
    context.selectedSpaceDetail = null;
    context.analysisMode = null;
    context.status = SpaceAnalysisContextStatus.POINT_RESOLVED;
    context.createdAt = now;
    context.updatedAt = now;
    context.expiresAt = new Date(
      now.getTime() + CONTEXT_TTL_HOURS * 60 * 60 * 1000,
    );

    const savedContext = await this.contextRepository.create(context);
    return this.toResult(savedContext, candidates);
  }

  private validateCoordinate(longitude: number, latitude: number): void {
    if (
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      longitude < -180 ||
      longitude > 180 ||
      latitude < -90 ||
      latitude > 90
    ) {
      throw new SpaceAnalysisContextError(
        'INVALID_COORDINATE',
        '경도·위도는 유효한 WGS84 좌표여야 합니다.',
      );
    }
  }

  private toResult(
    context: SpaceAnalysisContext,
    candidates: BuildingCandidate[],
  ): SpaceAnalysisContextResult {
    return {
      contextId: context.id,
      status: context.status,
      point: {
        longitude: Number(context.longitude),
        latitude: Number(context.latitude),
      },
      candidates,
      selectedBuildingId: context.selectedBuildingId,
      expiresAt: context.expiresAt.toISOString(),
    };
  }
}
