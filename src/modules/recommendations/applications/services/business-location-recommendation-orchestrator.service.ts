import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { DataSource, Repository } from 'typeorm';
import { ResolveAdministrativeAreaService } from '../../../administrative-areas/applications/resolve-administrative-area.service';
import {
  BusinessLocationRecommendationOutput,
  BusinessLocationRequestInput,
} from '../../domain/business-location-recommendation.types';
import { RecommendationEventService } from './recommendation-event.service';
import { RecommendationFlowError } from './recommendation-flow.error';
import { RecommendationRequest } from '../../infrastructure/persistence/typeorm/entities/recommendation-request.entity';
import { RecommendationEvidenceSnapshot } from '../../infrastructure/persistence/typeorm/entities/recommendation-evidence-snapshot.entity';
import { BusinessLocationRecommendationResult } from '../../infrastructure/persistence/typeorm/entities/business-location-recommendation-result.entity';
import { SqlBusinessLocationEvidenceCollector } from '../../infrastructure/evidence/sql-business-location-evidence.collector';
import { DeterministicBusinessLocationRecommendationAgent } from '../../infrastructure/agents/deterministic-business-location-recommendation-agent';
import { OpenAiBusinessLocationRecommendationAgent } from '../../infrastructure/agents/openai-business-location-recommendation-agent';
import { CodexBusinessLocationRecommendationAgent } from '../../infrastructure/agents/codex-business-location-recommendation-agent';
import { EcsCodexBusinessLocationRecommendationAgent } from '../../infrastructure/agents/ecs-codex-business-location-recommendation-agent';

const LEASE_MINUTES = 2;
const MAX_ATTEMPTS = 2;

@Injectable()
export class BusinessLocationRecommendationOrchestratorService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly workerId = `${hostname()}-${randomUUID()}`;
  private readonly logger = new Logger(
    BusinessLocationRecommendationOrchestratorService.name,
  );
  private recoveryTimer: NodeJS.Timeout | null = null;
  private recoveryRunning = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly resolver: ResolveAdministrativeAreaService,
    private readonly collector: SqlBusinessLocationEvidenceCollector,
    private readonly deterministicAgent: DeterministicBusinessLocationRecommendationAgent,
    private readonly openAiAgent: OpenAiBusinessLocationRecommendationAgent,
    private readonly codexAgent: CodexBusinessLocationRecommendationAgent,
    private readonly ecsCodexAgent: EcsCodexBusinessLocationRecommendationAgent,
    private readonly config: ConfigService,
    private readonly events: RecommendationEventService,
    @InjectRepository(RecommendationRequest)
    private readonly requests: Repository<RecommendationRequest>,
    @InjectRepository(RecommendationEvidenceSnapshot)
    private readonly evidence: Repository<RecommendationEvidenceSnapshot>,
    @InjectRepository(BusinessLocationRecommendationResult)
    private readonly results: Repository<BusinessLocationRecommendationResult>,
  ) {}

  onModuleInit(): void {
    setImmediate(() => this.runRecovery());
    this.recoveryTimer = setInterval(() => this.runRecovery(), 30_000);
  }

  onModuleDestroy(): void {
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
  }

  private async resumePendingRequests(): Promise<void> {
    const rows = await this.dataSource.query<Array<{ id: string }>>(
      `
      SELECT id::text AS id FROM recommendation_request
      WHERE analysis_type = 'BUSINESS_TO_AREA' AND attempt_count < $1
        AND (status = 'QUEUED' OR (status IN ('RESOLVING_LOCATION','COLLECTING_EVIDENCE','SCORING_WITH_AI','VALIDATING_RESULT') AND lease_expires_at < now()))
      ORDER BY created_at LIMIT 20
    `,
      [MAX_ATTEMPTS],
    );
    rows.forEach((row) => setImmediate(() => void this.process(row.id)));
  }

  private runRecovery(): void {
    if (this.recoveryRunning) return;
    this.recoveryRunning = true;
    void this.resumePendingRequests()
      .catch((error: unknown) =>
        this.logger.error(
          `Failed to recover pending business location requests: ${error instanceof Error ? error.message : String(error)}`,
        ),
      )
      .finally(() => {
        this.recoveryRunning = false;
      });
  }

  async create(
    userId: string,
    body: {
      businessCategoryCode: string;
      preferredLocation: { longitude: number; latitude: number };
      operatingHours: { opensAt: string; closesAt: string };
    },
    idempotencyKey?: string,
  ) {
    const [category] = await this.dataSource.query<
      Array<{ code: string; name: string | null }>
    >(
      'SELECT code, name FROM business_category WHERE code = $1 AND is_sales_supported = true',
      [body.businessCategoryCode],
    );
    if (!category)
      throw new NotFoundException({
        code: 'BUSINESS_CATEGORY_NOT_FOUND',
        message: '분석 가능한 업종을 찾을 수 없습니다.',
      });
    const area = await this.resolver.resolve(
      body.preferredLocation.longitude,
      body.preferredLocation.latitude,
    );
    const parsedCondition = {
      businessCategoryCode: category.code,
      businessCategoryName: category.name,
      preferredLocation: body.preferredLocation,
      operatingHours: body.operatingHours,
      preferredArea: area,
    };
    const requestHash = createHash('sha256')
      .update(JSON.stringify(parsedCondition))
      .digest('hex');
    const key = idempotencyKey?.trim() || null;
    if (key) {
      const existing = await this.requests.findOne({
        where: { userId, idempotencyKey: key },
      });
      if (existing) {
        if (existing.requestHash && existing.requestHash !== requestHash)
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: '동일 멱등키에 다른 요청 본문을 사용할 수 없습니다.',
          });
        return this.accepted(existing);
      }
    }
    const request = this.requests.create({
      userId,
      buildingId: null,
      analysisType: 'BUSINESS_TO_AREA',
      businessCategoryCode: category.code,
      preferredAdministrativeAreaId: area.id,
      inputLocation: null,
      requestHash,
      naturalLanguageQuery: null,
      parsedCondition,
      weights: null,
      status: 'QUEUED',
      progress: 0,
      currentStage: 'QUEUED',
      idempotencyKey: key,
      promptVersion: 'business-location-agent-v1',
      methodologyVersion: 'business-location-score-v1',
      model: null,
      dataAsOf: null,
      missingData: null,
      result: null,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      failureCode: null,
      failureMessage: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      attemptCount: 0,
    });
    let saved: RecommendationRequest;
    try {
      saved = await this.requests.save(request);
    } catch (error) {
      if (key && this.isUnique(error)) {
        const existing = await this.requests.findOne({
          where: { userId, idempotencyKey: key },
        });
        if (existing) return this.accepted(existing);
      }
      throw error;
    }
    await this.dataSource.query(
      `UPDATE recommendation_request
       SET input_location = ST_Transform(ST_SetSRID(ST_Point($2, $3), 4326), 5186)
       WHERE id = $1`,
      [
        saved.id,
        body.preferredLocation.longitude,
        body.preferredLocation.latitude,
      ],
    );
    await this.progress(saved.id, 'QUEUED', 0, '분석 요청이 접수되었습니다.');
    setImmediate(() => void this.process(saved.id));
    return this.accepted(saved);
  }

  async getOwned(requestId: string, userId: string) {
    const request = await this.requests.findOne({
      where: { id: requestId, userId, analysisType: 'BUSINESS_TO_AREA' },
    });
    if (!request)
      throw new NotFoundException('상권 추천 분석 요청을 찾을 수 없습니다.');
    return {
      requestId: request.id,
      status: request.status,
      progress: request.progress,
      stage: request.currentStage,
      result: request.result,
      failure: request.failureCode
        ? {
            code: request.failureCode,
            message: request.failureMessage,
            retryable: request.attemptCount < MAX_ATTEMPTS,
          }
        : null,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    };
  }

  async assertOwned(requestId: string, userId: string) {
    await this.getOwned(requestId, userId);
  }

  async process(requestId: string): Promise<void> {
    let claim: Array<{
      business_category_code: string;
      preferred_administrative_area_id: string;
      parsed_condition: Record<string, unknown>;
    }>;
    try {
      claim = await this.dataSource.query(
        `UPDATE recommendation_request SET status='RESOLVING_LOCATION', current_stage='RESOLVING_LOCATION', started_at=COALESCE(started_at,now()), lease_owner=$2, lease_expires_at=now()+($3||' minutes')::interval, attempt_count=attempt_count+1, updated_at=now() WHERE id=$1 AND analysis_type='BUSINESS_TO_AREA' AND attempt_count<$4 AND (status='QUEUED' OR (status IN ('RESOLVING_LOCATION','COLLECTING_EVIDENCE','SCORING_WITH_AI','VALIDATING_RESULT') AND lease_expires_at<now())) RETURNING business_category_code, preferred_administrative_area_id, parsed_condition`,
        [requestId, this.workerId, LEASE_MINUTES, MAX_ATTEMPTS],
      );
    } catch (error) {
      this.logger.error(
        `Failed to claim business location request ${requestId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    if (!claim[0]) return;
    const stopLeaseHeartbeat = this.startLeaseHeartbeat(requestId);
    try {
      const condition = claim[0].parsed_condition as {
        businessCategoryName: string;
        preferredLocation: { longitude: number; latitude: number };
        operatingHours: { opensAt: string; closesAt: string };
        preferredArea: BusinessLocationRequestInput['preferredArea'];
      };
      const input: BusinessLocationRequestInput = {
        requestId,
        businessCategoryCode: claim[0].business_category_code,
        businessCategoryName: condition.businessCategoryName,
        longitude: condition.preferredLocation.longitude,
        latitude: condition.preferredLocation.latitude,
        preferredArea: condition.preferredArea,
        operatingHours: condition.operatingHours,
      };
      await this.progress(
        requestId,
        'COLLECTING_EVIDENCE',
        25,
        '선호지역 안의 업종·점포·유동인구 근거를 수집하고 있습니다.',
      );
      await this.events.publish(requestId, 'tool_started', {
        toolName: 'get_business_location_recommendation_evidence',
      });
      const packet = await this.collector.collect(input);
      await this.evidence.delete({
        requestId,
        toolName: 'get_business_location_recommendation_evidence',
      });
      await this.evidence.save(
        this.evidence.create({
          requestId,
          evidenceId: `ev_${requestId}_business_location`,
          toolName: 'get_business_location_recommendation_evidence',
          sourceTable: 'area_business_feature',
          sourcePeriod: packet.dataAsOf.commerce,
          quality: 'DERIVED',
          payload: packet as unknown as Record<string, unknown>,
          payloadHash: createHash('sha256')
            .update(JSON.stringify(packet))
            .digest('hex'),
          durationMs: null,
        }),
      );
      await this.events.publish(requestId, 'tool_completed', {
        toolName: 'get_business_location_recommendation_evidence',
        evidenceCount: packet.candidates.length,
        sourcePeriod: packet.dataAsOf.commerce,
      });
      await this.progress(
        requestId,
        'SCORING_WITH_AI',
        65,
        '수집한 근거를 기준으로 후보 상권을 평가하고 있습니다.',
      );
      const output = await this.generateWithRetry(packet);
      this.validateOutput(
        output,
        packet.candidates.map((candidate) => candidate.commercialAreaId),
      );
      this.canonicalizeScores(output, packet);
      await this.progress(
        requestId,
        'VALIDATING_RESULT',
        85,
        '추천 후보와 점수·근거를 검증하고 있습니다.',
      );
      const result = {
        requestId,
        analysisType: 'BUSINESS_TO_AREA',
        preferredArea: input.preferredArea,
        businessCategory: {
          code: input.businessCategoryCode,
          name: input.businessCategoryName,
        },
        operatingHours: input.operatingHours,
        summary: output.summary,
        recommendations: output.recommendations,
        warnings: output.warnings,
        dataLimitations: output.dataLimitations,
        dataAsOf: output.dataAsOf,
      };
      await this.dataSource.transaction(async (manager) => {
        await manager.delete(BusinessLocationRecommendationResult, {
          requestId,
        });
        for (const recommendation of output.recommendations) {
          const row = manager.create(BusinessLocationRecommendationResult, {
            requestId,
            commercialAreaId: recommendation.commercialAreaId,
            administrativeAreaId: input.preferredArea.id,
            commercialAreaCode: recommendation.commercialAreaCode,
            commercialAreaName: recommendation.commercialAreaName,
            rank: recommendation.rank,
            totalScore: recommendation.totalScore.toFixed(2),
            scoreBreakdown: recommendation.scoreBreakdown as unknown as Record<
              string,
              unknown
            >,
            operatingHourFit: recommendation.operatingHourFit,
            reasons: [
              recommendation.oneLineReason,
              ...recommendation.evidence.map((item) => item.interpretation),
            ],
            risks: recommendation.risks,
            evidenceIds: recommendation.evidenceIds,
          });
          await manager.save(BusinessLocationRecommendationResult, row);
        }
        await manager.update(RecommendationRequest, requestId, {
          status: 'COMPLETED',
          currentStage: 'COMPLETED',
          progress: 100,
          result,
          missingData: packet.missingData,
          completedAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
          updatedAt: new Date(),
        });
      });
      await this.publishTerminalEventSafely(requestId, 'completed', result);
    } catch (error) {
      await this.fail(requestId, error);
    } finally {
      stopLeaseHeartbeat();
    }
  }

  private async progress(
    requestId: string,
    stage: string,
    progress: number,
    message: string,
  ) {
    await this.requests.update(requestId, {
      status: stage,
      currentStage: stage,
      progress,
      updatedAt: new Date(),
      leaseExpiresAt: new Date(Date.now() + LEASE_MINUTES * 60_000),
    });
    await this.events.publish(requestId, 'progress', {
      stage,
      progress,
      message,
    });
  }
  private async fail(requestId: string, error: unknown) {
    const code =
      error instanceof RecommendationFlowError
        ? error.code
        : error instanceof Error && error.name === 'INSUFFICIENT_EVIDENCE'
          ? 'INSUFFICIENT_EVIDENCE'
          : error instanceof Error &&
              [
                'MODEL_TIMEOUT',
                'CODEX_AGENT_RUNNER_ERROR',
                'AGENT_RESULT_NOT_AVAILABLE',
                'INVALID_MODEL_OUTPUT',
                'RECOMMENDATION_AGENT_NOT_CONFIGURED',
              ].includes(error.name)
            ? error.name
            : 'BUSINESS_LOCATION_RECOMMENDATION_FAILED';
    const message = this.safeFailureMessage(code, error);
    const retryable = [
      'MODEL_TIMEOUT',
      'CODEX_AGENT_RUNNER_ERROR',
      'AGENT_RESULT_NOT_AVAILABLE',
    ].includes(code);
    this.logger.error(`Business location request ${requestId} failed: ${code}`);
    await this.requests.update(requestId, {
      status: 'FAILED',
      currentStage: 'FAILED',
      progress: 100,
      failedAt: new Date(),
      failureCode: code,
      failureMessage: message,
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: new Date(),
    });
    await this.publishTerminalEventSafely(requestId, 'failed', {
      code,
      message,
      retryable,
    });
  }
  private validateOutput(
    output: BusinessLocationRecommendationOutput,
    candidateIds: string[],
  ) {
    if (!output.recommendations.length || output.recommendations.length > 5)
      throw new RecommendationFlowError(
        'INVALID_MODEL_OUTPUT',
        '추천 결과 개수가 올바르지 않습니다.',
        500,
      );
    const allowed = new Set(candidateIds);
    const seen = new Set<string>();
    output.recommendations.forEach((item, index) => {
      if (
        !allowed.has(item.commercialAreaId) ||
        seen.has(item.commercialAreaId) ||
        item.rank !== index + 1 ||
        item.totalScore < 0 ||
        item.totalScore > 100
      )
        throw new RecommendationFlowError(
          'INVALID_MODEL_OUTPUT',
          '후보 외 상권 또는 잘못된 점수가 반환되었습니다.',
          500,
        );
      seen.add(item.commercialAreaId);
    });
  }

  private async publishTerminalEventSafely(
    requestId: string,
    eventType: 'completed' | 'failed',
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.events.publish(requestId, eventType, payload);
    } catch (error) {
      this.logger.error(
        `Business location request ${requestId} persisted as ${eventType}, but its SSE event could not be saved: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  private selectedAgent() {
    const mode =
      this.config.get<string>('BUSINESS_LOCATION_AGENT_MODE') ??
      this.config.get<string>('RECOMMENDATION_AGENT_MODE', 'deterministic');
    if (mode === 'openai') return this.openAiAgent;
    if (mode === 'codex') {
      return this.config.get<string>('RECOMMENDATION_AGENT_RUNNER', 'local') ===
        'ecs'
        ? this.ecsCodexAgent
        : this.codexAgent;
    }
    return this.deterministicAgent;
  }

  private async generateWithRetry(
    packet: Parameters<
      DeterministicBusinessLocationRecommendationAgent['generate']
    >[0],
  ): Promise<BusinessLocationRecommendationOutput> {
    const agent = this.selectedAgent();
    try {
      return await agent.generate(packet);
    } catch (firstError) {
      if (!this.isRetryableAgentError(firstError)) throw firstError;
      return agent.generate(packet).catch(() => {
        throw firstError;
      });
    }
  }

  private isRetryableAgentError(error: unknown): boolean {
    return (
      error instanceof Error &&
      [
        'MODEL_TIMEOUT',
        'CODEX_AGENT_RUNNER_ERROR',
        'AGENT_RESULT_NOT_AVAILABLE',
      ].includes(error.name)
    );
  }

  private safeFailureMessage(code: string, error: unknown): string {
    if (code === 'RECOMMENDATION_AGENT_NOT_CONFIGURED')
      return 'AI 추천 에이전트 설정이 완료되지 않았습니다.';
    if (code === 'INVALID_MODEL_OUTPUT')
      return 'AI 추천 결과 형식 검증에 실패했습니다.';
    if (code === 'CODEX_AGENT_RUNNER_ERROR')
      return 'Codex 작업 컨테이너 실행에 실패했습니다. 서버 로그를 확인하세요.';
    if (code === 'AGENT_RESULT_NOT_AVAILABLE')
      return 'AI 분석 작업은 종료됐지만 결과 저장 확인이 지연되고 있습니다. 다시 시도해 주세요.';
    return error instanceof Error
      ? error.message
      : '상권 추천 분석 중 오류가 발생했습니다.';
  }

  private startLeaseHeartbeat(requestId: string): () => void {
    const timer = setInterval(() => {
      void this.dataSource
        .query(
          `UPDATE recommendation_request
           SET lease_expires_at = now() + ($3 || ' minutes')::interval,
               updated_at = now()
           WHERE id = $1 AND lease_owner = $2
             AND status IN ('RESOLVING_LOCATION','COLLECTING_EVIDENCE','SCORING_WITH_AI','VALIDATING_RESULT')`,
          [requestId, this.workerId, LEASE_MINUTES],
        )
        .catch((error: unknown) =>
          this.logger.warn(
            `Failed to renew lease for ${requestId}: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
    }, 30_000);
    return () => clearInterval(timer);
  }

  private canonicalizeScores(
    output: BusinessLocationRecommendationOutput,
    packet: Parameters<
      DeterministicBusinessLocationRecommendationAgent['generate']
    >[0],
  ): void {
    const authoritative =
      this.deterministicAgent.getServerRecommendations(packet);
    const byArea = new Map(
      authoritative.map((recommendation) => [
        recommendation.commercialAreaId,
        recommendation,
      ]),
    );
    output.recommendations = output.recommendations.map((recommendation) => {
      const source = byArea.get(recommendation.commercialAreaId);
      if (!source) return recommendation;
      return {
        ...recommendation,
        totalScore: source.totalScore,
        scoreBreakdown: source.scoreBreakdown,
        operatingHourFit: source.operatingHourFit,
        commercialAreaCode: source.commercialAreaCode,
        commercialAreaName: source.commercialAreaName,
        administrativeArea: source.administrativeArea,
        longitude: source.longitude,
        latitude: source.latitude,
      };
    });
  }
  private accepted(request: RecommendationRequest) {
    return {
      requestId: request.id,
      status: request.status,
      eventsUrl: `/api/v1/recommendation-requests/${request.id}/events`,
      resultUrl: `/api/v1/recommendation-requests/${request.id}`,
    };
  }
  private isUnique(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }
}
