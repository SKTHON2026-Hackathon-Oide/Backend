import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID, createHash } from 'node:crypto';
import { hostname } from 'node:os';
import { DataSource, Repository } from 'typeorm';
import { RECOMMENDATION_AGENT } from '../../domain/ports/recommendation-agent.port';
import type {
  RecommendationAgentContext,
  RecommendationAgentPort,
} from '../../domain/ports/recommendation-agent.port';
import {
  RECOMMENDATION_METHODOLOGY_VERSION,
  RECOMMENDATION_PROMPT_VERSION,
  RecommendationChart,
  RecommendationChartSelection,
  RecommendationAgentOutput,
  RecommendationEvidencePacket,
  RecommendationStage,
  RecommendationStatus,
  SCORE_WEIGHTS,
} from '../../domain/recommendation.types';
import { SqlRecommendationEvidenceCollector } from '../../infrastructure/evidence/sql-recommendation-evidence.collector';
import { DeterministicRecommendationAgent } from '../../infrastructure/agents/deterministic-recommendation-agent';
import { RecommendationEvidenceSnapshot } from '../../infrastructure/persistence/typeorm/entities/recommendation-evidence-snapshot.entity';
import { RecommendationRequest } from '../../infrastructure/persistence/typeorm/entities/recommendation-request.entity';
import { SpaceBusinessRecommendationResult } from '../../infrastructure/persistence/typeorm/entities/space-business-recommendation-result.entity';
import { RecommendationEventService } from './recommendation-event.service';
import { RecommendationFlowError } from './recommendation-flow.error';

const LEASE_MINUTES = 2;
const MAX_ATTEMPTS = 2;

@Injectable()
export class RecommendationOrchestratorService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly workerId = `${hostname()}-${randomUUID()}`;
  private readonly logger = new Logger(RecommendationOrchestratorService.name);
  private recoveryTimer: NodeJS.Timeout | null = null;
  private recoveryRunning = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly collector: SqlRecommendationEvidenceCollector,
    private readonly deterministicAgent: DeterministicRecommendationAgent,
    private readonly eventService: RecommendationEventService,
    @Inject(RECOMMENDATION_AGENT)
    private readonly agent: RecommendationAgentPort,
    @InjectRepository(RecommendationRequest)
    private readonly requestRepository: Repository<RecommendationRequest>,
    @InjectRepository(RecommendationEvidenceSnapshot)
    private readonly evidenceRepository: Repository<RecommendationEvidenceSnapshot>,
  ) {}

  onModuleInit(): void {
    setImmediate(() => this.runRecovery());
    this.recoveryTimer = setInterval(() => this.runRecovery(), 30_000);
  }

  onModuleDestroy(): void {
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
  }

  async create(
    userId: string,
    buildingId: string,
    idempotencyKey: string | undefined,
    userPreference?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    await this.assertUserExists(userId);
    await this.assertBuildingExists(buildingId);

    const key = idempotencyKey?.trim() || null;
    if (key) {
      const existing = await this.requestRepository.findOne({
        where: { userId, idempotencyKey: key },
      });
      if (existing) return this.toAcceptedResponse(existing);
    }

    const request = this.requestRepository.create({
      userId,
      buildingId,
      naturalLanguageQuery: null,
      parsedCondition: userPreference ?? null,
      weights: SCORE_WEIGHTS,
      status: 'QUEUED',
      progress: 0,
      currentStage: 'QUEUED',
      idempotencyKey: key,
      promptVersion: RECOMMENDATION_PROMPT_VERSION,
      methodologyVersion: RECOMMENDATION_METHODOLOGY_VERSION,
      model: this.config.get<string>('RECOMMENDATION_MODEL') ?? null,
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
      saved = await this.requestRepository.save(request);
    } catch (error) {
      if (this.isUniqueViolation(error) && key) {
        const existing = await this.requestRepository.findOne({
          where: { userId, idempotencyKey: key },
        });
        if (existing) return this.toAcceptedResponse(existing);
      }
      throw error;
    }

    await this.publishProgress(
      saved.id,
      'QUEUED',
      'QUEUED',
      0,
      '분석 요청이 접수되었습니다.',
    );
    setImmediate(() => void this.process(saved.id));
    return this.toAcceptedResponse(saved);
  }

  async getOwned(
    requestId: string,
    userId: string,
  ): Promise<Record<string, unknown>> {
    const request = await this.findOwned(requestId, userId);
    return {
      requestId: request.id,
      status: request.status,
      progress: request.progress,
      stage: request.currentStage,
      result: request.result,
      failure:
        request.failureCode === null
          ? null
          : {
              code: request.failureCode,
              message: request.failureMessage,
              retryable: request.attemptCount < MAX_ATTEMPTS,
            },
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    };
  }

  async assertOwned(requestId: string, userId: string): Promise<void> {
    await this.findOwned(requestId, userId);
  }

  async process(requestId: string): Promise<void> {
    let claimed: { buildingId: string } | null = null;
    let stopLeaseHeartbeat: (() => void) | null = null;
    try {
      claimed = await this.claim(requestId);
      if (!claimed) return;
      stopLeaseHeartbeat = this.startLeaseHeartbeat(requestId);

      await this.publishProgress(
        requestId,
        'RESOLVING_LOCATION',
        'RESOLVING_LOCATION',
        15,
        '건물과 분석 상권을 확인하고 있습니다.',
      );
      await this.publishProgress(
        requestId,
        'COLLECTING_EVIDENCE',
        'COLLECTING_EVIDENCE',
        25,
        '주변 업종·점포·유동인구 근거를 수집하고 있습니다.',
      );
      await this.publishToolStarted(requestId);
      const packet = await this.collectEvidenceWithRetry(
        requestId,
        claimed.buildingId,
      );
      await this.publishToolCompleted(requestId, packet);
      for (const missing of packet.missingData) {
        await this.eventService.publish(requestId, 'warning', missing);
      }
      await this.persistEvidence(requestId, packet);

      await this.publishProgress(
        requestId,
        'SCORING_WITH_AI',
        'SCORING_WITH_AI',
        65,
        '수집한 근거를 기준으로 업종별 점수를 계산하고 있습니다.',
      );
      const output = await this.generateWithRetry(packet, {
        requestId,
        buildingId: claimed.buildingId,
      });
      this.applyServerScores(output, packet);
      this.applyServerSelectedCommercialArea(output, packet);
      this.attachCharts(output, packet);

      await this.publishProgress(
        requestId,
        'VALIDATING_RESULT',
        'VALIDATING_RESULT',
        85,
        '추천 후보와 점수 산식을 검증하고 있습니다.',
      );
      this.validateOutput(output, packet);
      this.canonicalizeOutput(output, packet);
      const result = this.toFinalResult(requestId, packet, output);
      await this.saveCompletedResult(requestId, packet, output, result);
      await this.publishTerminalEventSafely(requestId, 'completed', result);
    } catch (error) {
      await this.fail(requestId, error);
    } finally {
      stopLeaseHeartbeat?.();
    }
  }

  private async resumePendingRequests(): Promise<void> {
    const rows = await this.dataSource.query<{ id: string }[]>(
      `SELECT id::text AS id
       FROM recommendation_request
       WHERE attempt_count < $1
         AND building_id IS NOT NULL
         AND (
           status = 'QUEUED'
           OR (status IN ('RESOLVING_LOCATION', 'COLLECTING_EVIDENCE', 'SCORING_WITH_AI', 'VALIDATING_RESULT')
               AND lease_expires_at < now())
         )
       ORDER BY created_at
       LIMIT 20`,
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
          `Failed to recover pending recommendation requests: ${error instanceof Error ? error.message : String(error)}`,
        ),
      )
      .finally(() => {
        this.recoveryRunning = false;
      });
  }

  private async claim(
    requestId: string,
  ): Promise<{ buildingId: string } | null> {
    const rawResult: unknown = await this.dataSource.query(
      `UPDATE recommendation_request
       SET status = 'RESOLVING_LOCATION',
           current_stage = 'RESOLVING_LOCATION',
           started_at = COALESCE(started_at, now()),
           lease_owner = $2,
           lease_expires_at = now() + ($3 || ' minutes')::interval,
           attempt_count = attempt_count + 1,
           updated_at = now()
       WHERE id = $1
         AND attempt_count < $4
         AND (
           status = 'QUEUED'
           OR (status IN ('RESOLVING_LOCATION', 'COLLECTING_EVIDENCE', 'SCORING_WITH_AI', 'VALIDATING_RESULT')
               AND lease_expires_at < now())
         )
      RETURNING id::text AS request_id, building_id::text AS building_id`,
      [requestId, this.workerId, LEASE_MINUTES, MAX_ATTEMPTS],
    );
    const [row] = this.unwrapRows<{ building_id: string }>(rawResult);
    if (!row) return null;
    if (!row.building_id) {
      const error = new Error('추천 요청에 대상 건물이 없습니다.');
      error.name = 'INVALID_RECOMMENDATION_REQUEST';
      throw error;
    }
    return { buildingId: row.building_id };
  }

  private startLeaseHeartbeat(requestId: string): () => void {
    const timer = setInterval(() => {
      void this.dataSource
        .query(
          `UPDATE recommendation_request
           SET lease_expires_at = now() + ($3 || ' minutes')::interval,
               updated_at = now()
           WHERE id = $1 AND lease_owner = $2
             AND status IN ('RESOLVING_LOCATION', 'COLLECTING_EVIDENCE', 'SCORING_WITH_AI', 'VALIDATING_RESULT')`,
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

  private async collectEvidenceWithRetry(
    requestId: string,
    buildingId: string,
  ): Promise<RecommendationEvidencePacket> {
    try {
      return await this.collector.collect(requestId, buildingId);
    } catch (firstError) {
      await this.eventService.publish(requestId, 'warning', {
        code: 'EVIDENCE_RETRY',
        message: '근거 조회 중 일시 오류가 발생해 한 번 더 시도합니다.',
      });
      return this.collector.collect(requestId, buildingId).catch(() => {
        throw firstError;
      });
    }
  }

  private async generateWithRetry(
    packet: RecommendationEvidencePacket,
    context: RecommendationAgentContext,
  ): Promise<RecommendationAgentOutput> {
    try {
      return await this.agent.generate(packet, context);
    } catch (firstError) {
      if (!this.isRetryableAgentError(firstError)) throw firstError;
      return this.agent.generate(packet, context).catch(() => {
        throw firstError;
      });
    }
  }

  private async persistEvidence(
    requestId: string,
    packet: RecommendationEvidencePacket,
  ): Promise<void> {
    const records = [
      {
        evidenceId: packet.building.evidenceId,
        toolName: 'resolve_building_trade_area',
        sourceTable: 'building,commercial_area_building,commercial_area',
        sourcePeriod: null,
        quality: 'DERIVED',
        payload: packet.building as unknown as Record<string, unknown>,
      },
      {
        evidenceId: packet.commerce.evidenceId,
        toolName: 'get_local_commerce_evidence',
        sourceTable: 'area_business_feature,store',
        sourcePeriod: packet.commerce.sourcePeriod,
        quality: 'MEASURED',
        payload: packet.commerce as unknown as Record<string, unknown>,
      },
      {
        evidenceId: packet.population.evidenceId,
        toolName: 'get_population_evidence',
        sourceTable: 'commercial_area_floating_population_statistic',
        sourcePeriod: packet.population.sourcePeriod,
        quality: 'MEASURED',
        payload: packet.population as unknown as Record<string, unknown>,
      },
      ...packet.commerce.candidates.map((candidate) => ({
        evidenceId: candidate.evidenceId,
        toolName: 'get_local_commerce_evidence',
        sourceTable: 'area_business_feature,store',
        sourcePeriod: packet.commerce.sourcePeriod,
        quality: 'DERIVED',
        payload: candidate as unknown as Record<string, unknown>,
      })),
      ...packet.profiles.map((profile) => ({
        evidenceId: profile.evidenceId,
        toolName: 'get_business_profiles',
        sourceTable: 'business_category_analysis_profile',
        sourcePeriod: 'hackathon-v1',
        quality: 'PROXY',
        payload: profile as unknown as Record<string, unknown>,
      })),
    ];
    await this.evidenceRepository.delete({ requestId });
    await this.evidenceRepository.save(
      records.map((record) =>
        this.evidenceRepository.create({
          requestId,
          ...record,
          payloadHash: createHash('sha256')
            .update(JSON.stringify(record.payload))
            .digest('hex'),
          durationMs: null,
        }),
      ),
    );
  }

  private validateOutput(
    output: RecommendationAgentOutput,
    packet: RecommendationEvidencePacket,
  ): void {
    if (
      output.recommendations.length === 0 ||
      output.recommendations.length > 5
    ) {
      throw new RecommendationFlowError(
        'INVALID_MODEL_OUTPUT',
        '추천 결과 개수가 올바르지 않습니다.',
        500,
      );
    }
    const candidates = new Set(
      packet.commerce.candidates.map((candidate) => candidate.code),
    );
    const linkedAreas = packet.building.commercialAreas;
    const selectedArea = output.selectedCommercialArea;
    const expectedArea = linkedAreas[0];
    if (!expectedArea) {
      if (
        selectedArea.code !== null ||
        selectedArea.name !== null ||
        selectedArea.matchMethod !== null ||
        selectedArea.overlapRatio !== null ||
        selectedArea.distanceMeters !== null
      ) {
        throw new RecommendationFlowError(
          'RESULT_VALIDATION_FAILED',
          '연결 상권이 없는데 선택 상권이 반환되었습니다.',
          500,
        );
      }
    } else {
      const expectedMethod =
        expectedArea.relation === 'DIRECT' ? 'OVERLAP' : 'NEAREST';
      if (
        selectedArea.code !== expectedArea.code ||
        selectedArea.name !== expectedArea.name ||
        selectedArea.matchMethod !== expectedMethod ||
        selectedArea.overlapRatio !== expectedArea.overlapRatio ||
        selectedArea.distanceMeters !== (expectedArea.distanceMeters ?? null)
      ) {
        throw new RecommendationFlowError(
          'RESULT_VALIDATION_FAILED',
          '선택 상권 또는 연결 근거가 입력 데이터와 일치하지 않습니다.',
          500,
        );
      }
    }
    output.recommendations.forEach((recommendation, index) => {
      if (
        recommendation.rank !== index + 1 ||
        !candidates.has(recommendation.businessCategoryCode)
      ) {
        throw new RecommendationFlowError(
          'RESULT_VALIDATION_FAILED',
          '추천 후보가 조회된 업종 목록과 일치하지 않습니다.',
          500,
        );
      }
      if (
        recommendation.confidence < 0 ||
        recommendation.confidence > 1 ||
        (recommendation.totalScore !== null &&
          (recommendation.totalScore < 0 || recommendation.totalScore > 100))
      ) {
        throw new RecommendationFlowError(
          'RESULT_VALIDATION_FAILED',
          '추천 confidence 또는 점수 범위 검증에 실패했습니다.',
          500,
        );
      }
    });
  }

  private applyServerScores(
    output: RecommendationAgentOutput,
    packet: RecommendationEvidencePacket,
  ): void {
    const scores = this.deterministicAgent.getServerScores(packet);
    output.recommendations.forEach((recommendation) => {
      recommendation.totalScore =
        scores.get(recommendation.businessCategoryCode) ?? null;
    });
  }

  private applyServerSelectedCommercialArea(
    output: RecommendationAgentOutput,
    packet: RecommendationEvidencePacket,
  ): void {
    const area = packet.building.commercialAreas[0];
    const authoritativeArea: RecommendationAgentOutput['selectedCommercialArea'] =
      area
        ? {
            code: area.code,
            name: area.name,
            matchMethod: area.relation === 'DIRECT' ? 'OVERLAP' : 'NEAREST',
            overlapRatio: area.overlapRatio,
            distanceMeters: area.distanceMeters ?? null,
          }
        : {
            code: null,
            name: null,
            matchMethod: null,
            overlapRatio: null,
            distanceMeters: null,
          };
    if (
      JSON.stringify(output.selectedCommercialArea) !==
      JSON.stringify(authoritativeArea)
    ) {
      this.logger.warn(
        `Normalized AI-selected commercial area to server evidence for building ${packet.building.buildingId}.`,
      );
    }
    output.selectedCommercialArea = authoritativeArea;
  }

  private toFinalResult(
    requestId: string,
    packet: RecommendationEvidencePacket,
    output: RecommendationAgentOutput,
  ): Record<string, unknown> {
    return {
      requestId,
      status: 'COMPLETED',
      building: {
        id: packet.building.buildingId,
        address: packet.building.address,
        name: packet.building.buildingName,
        point: {
          longitude: packet.building.longitude,
          latitude: packet.building.latitude,
        },
      },
      summary: output.summary,
      selectedCommercialArea: output.selectedCommercialArea,
      recommendations: output.recommendations.map((recommendation) => {
        const publicRecommendation = { ...recommendation };
        delete publicRecommendation.chartSelections;
        return publicRecommendation;
      }),
      warnings: output.warnings,
      dataLimitations: output.dataLimitations,
      methodologyVersion: RECOMMENDATION_METHODOLOGY_VERSION,
      promptVersion: RECOMMENDATION_PROMPT_VERSION,
      agentMode: this.config.get<string>(
        'RECOMMENDATION_AGENT_MODE',
        'deterministic',
      ),
      disclaimer:
        '통계 기반 의사결정 보조 결과이며 창업 성공이나 수익을 보장하지 않습니다.',
    };
  }

  private async saveCompletedResult(
    requestId: string,
    packet: RecommendationEvidencePacket,
    output: RecommendationAgentOutput,
    result: Record<string, unknown>,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(SpaceBusinessRecommendationResult, { requestId });
      const resultEntities = output.recommendations.map((recommendation) =>
        manager.create(SpaceBusinessRecommendationResult, {
          requestId,
          businessCategoryCode: recommendation.businessCategoryCode,
          businessCategoryName: recommendation.businessCategoryName,
          rank: recommendation.rank,
          totalScore:
            recommendation.totalScore === null
              ? null
              : recommendation.totalScore.toFixed(2),
          scoreBreakdown: {
            confidence: recommendation.confidence,
          },
          recommendedOperatingHours: recommendation.operatingTips,
          reasons: [
            recommendation.oneLineReason,
            ...recommendation.evidence.map((item) => item.interpretation),
          ],
          risks: recommendation.risks,
          evidenceIds: [],
        }),
      );
      await manager.save(resultEntities);
      await manager.save(
        RecommendationRequest,
        manager.create(RecommendationRequest, {
          id: requestId,
          status: 'COMPLETED',
          progress: 100,
          currentStage: 'COMPLETED',
          dataAsOf: packet.dataAsOf,
          missingData: packet.missingData,
          result,
          completedAt: new Date(),
          updatedAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
        }),
      );
    });
  }

  private canonicalizeOutput(
    output: RecommendationAgentOutput,
    packet: RecommendationEvidencePacket,
  ): void {
    const names = new Map(
      packet.commerce.candidates.map((candidate) => [
        candidate.code,
        candidate.name,
      ]),
    );
    output.recommendations.forEach((recommendation) => {
      recommendation.businessCategoryName =
        names.get(recommendation.businessCategoryCode) ??
        recommendation.businessCategoryName;
      recommendation.oneLineReason = this.sanitizeDisplayText(
        recommendation.oneLineReason,
      );
      recommendation.risks = recommendation.risks.map((risk) =>
        this.sanitizeDisplayText(risk),
      );
      recommendation.operatingTips = recommendation.operatingTips.map((tip) =>
        this.sanitizeDisplayText(tip),
      );
      recommendation.evidence = recommendation.evidence.map((evidence) => ({
        ...evidence,
        metric: this.displayMetric(evidence.metric),
        interpretation: this.sanitizeDisplayText(evidence.interpretation),
        statisticsPeriod:
          evidence.statisticsPeriod.from === 'hackathon-v1' ||
          evidence.statisticsPeriod.to === 'hackathon-v1'
            ? { from: null, to: null }
            : evidence.statisticsPeriod,
      }));
    });
    output.summary = this.sanitizeDisplayText(output.summary);
    output.warnings = output.warnings.map((warning) =>
      this.sanitizeDisplayText(warning),
    );
    output.dataLimitations = output.dataLimitations.map((limitation) =>
      this.sanitizeDisplayText(limitation),
    );
    const missingWarnings = packet.missingData.map((missing) =>
      this.sanitizeDisplayText(`${missing.key}: ${missing.reason}`),
    );
    output.warnings = [...new Set([...output.warnings, ...missingWarnings])];
    output.dataLimitations = [
      ...new Set([
        ...output.dataLimitations,
        ...packet.missingData.map((missing) =>
          this.sanitizeDisplayText(missing.reason),
        ),
      ]),
    ];
  }

  private displayMetric(metric: string): string {
    const labels: Record<string, string> = {
      demandScore: '수요 적합도',
      competitionScore: '경쟁 강도',
      estimatedSalesAmount: '상권 추정 매출',
      storeCount: '동종 업종 점포 수',
      nearbyStoreCount: '반경 내 동종 점포 수',
      totalPopulation: '총 유동인구',
      profileConfidence: '분석 신뢰도',
      closureRate: '관측 폐업률',
      overlapRatio: '상권 일치도',
    };
    return labels[metric] ?? metric;
  }

  private sanitizeDisplayText(value: string): string {
    return value
      .replace(/\bdemandScore\b/g, '수요 적합도')
      .replace(/\bcompetitionScore\b/g, '경쟁 강도')
      .replace(/\bestimatedSalesAmount\b/g, '상권 추정 매출')
      .replace(/\bstoreCount\b/g, '동종 업종 점포 수')
      .replace(/\bnearbyStoreCount\b/g, '반경 내 동종 점포 수')
      .replace(/\bprofileConfidence\b/g, '분석 신뢰도')
      .replace(/\bTIME_(\d{2})_(\d{2})\b/g, '$1~$2시')
      .replace(/\b(LOW|MEDIUM|HIGH)\b/g, (label) => {
        const labels: Record<string, string> = {
          LOW: '낮음',
          MEDIUM: '보통',
          HIGH: '높음',
        };
        return labels[label] ?? label;
      })
      .replace(/\bhackathon-v1\b/g, '내부 프로필 기준');
  }

  private attachCharts(
    output: RecommendationAgentOutput,
    packet: RecommendationEvidencePacket,
  ): void {
    output.recommendations.forEach((recommendation) => {
      const selections = recommendation.chartSelections ?? [];
      recommendation.charts = selections
        .slice(0, 2)
        .map((selection) =>
          this.buildChart(
            selection,
            recommendation.businessCategoryCode,
            packet,
          ),
        )
        .filter((chart): chart is RecommendationChart => chart !== null);
    });
  }

  private buildChart(
    selection: RecommendationChartSelection,
    businessCategoryCode: string,
    packet: RecommendationEvidencePacket,
  ): RecommendationChart | null {
    switch (selection.type) {
      case 'POPULATION_BY_TIME':
        return this.buildPopulationTimeChart(packet, selection.reason);
      case 'POPULATION_BY_AGE':
        return this.buildPopulationAgeChart(packet, selection.reason);
      case 'POPULATION_BY_DAY':
        return this.buildPopulationDayChart(packet, selection.reason);
      case 'BUSINESS_COMPARISON':
        return this.buildBusinessComparisonChart(packet, businessCategoryCode);
      default:
        return null;
    }
  }

  private buildPopulationTimeChart(
    packet: RecommendationEvidencePacket,
    fallbackDescription: string,
  ): RecommendationChart | null {
    const orderedRanges = [
      '00:00-06:00',
      '06:00-11:00',
      '11:00-14:00',
      '14:00-17:00',
      '17:00-21:00',
      '21:00-24:00',
    ];
    const byRange = new Map(
      packet.population.timeBands.map((band) => [
        band.timeRange,
        band.population,
      ]),
    );
    const rows = orderedRanges
      .map((range) => ({ range, value: byRange.get(range) ?? null }))
      .filter((row) => row.value !== null);
    if (rows.length < 3) return null;
    const peak = rows.reduce((best, row) =>
      (row.value ?? 0) > (best.value ?? 0) ? row : best,
    );
    return {
      id: 'population-time-band',
      type: 'BAR',
      title: '시간대별 유동인구',
      description:
        peak.value === null
          ? fallbackDescription
          : `${this.formatTimeRange(peak.range)} 유동인구가 ${peak.value.toLocaleString('ko-KR')}명으로 가장 많습니다.`,
      unit: '명',
      categories: rows.map((row) => this.formatTimeRange(row.range)),
      series: [{ name: '유동인구', values: rows.map((row) => row.value) }],
      statisticsPeriod: this.chartPeriod(packet.population.sourcePeriod),
    };
  }

  private buildPopulationAgeChart(
    packet: RecommendationEvidencePacket,
    fallbackDescription: string,
  ): RecommendationChart | null {
    const labels: Record<string, string> = {
      TEENS: '10대',
      '20S': '20대',
      '30S': '30대',
      '40S': '40대',
      '50S': '50대',
      '60_PLUS': '60대 이상',
    };
    const rows = Object.entries(packet.population.ageGroups)
      .filter(([, value]) => value !== null)
      .map(([key, value]) => ({ label: labels[key] ?? key, value }));
    if (rows.length < 3) return null;
    const peak = rows.reduce((best, row) =>
      (row.value ?? 0) > (best.value ?? 0) ? row : best,
    );
    return {
      id: 'population-age-group',
      type: 'BAR',
      title: '연령대별 유동인구',
      description:
        peak.value === null
          ? fallbackDescription
          : `${peak.label} 유동인구가 ${peak.value.toLocaleString('ko-KR')}명으로 가장 많습니다.`,
      unit: '명',
      categories: rows.map((row) => row.label),
      series: [{ name: '유동인구', values: rows.map((row) => row.value) }],
      statisticsPeriod: this.chartPeriod(packet.population.sourcePeriod),
    };
  }

  private buildPopulationDayChart(
    packet: RecommendationEvidencePacket,
    fallbackDescription: string,
  ): RecommendationChart | null {
    const labels: Record<string, string> = {
      MONDAY: '월요일',
      TUESDAY: '화요일',
      WEDNESDAY: '수요일',
      THURSDAY: '목요일',
      FRIDAY: '금요일',
      SATURDAY: '토요일',
      SUNDAY: '일요일',
    };
    const rows = Object.entries(packet.population.dayOfWeek)
      .filter(([, value]) => value !== null)
      .map(([key, value]) => ({ label: labels[key] ?? key, value }));
    if (rows.length < 3) return null;
    const peak = rows.reduce((best, row) =>
      (row.value ?? 0) > (best.value ?? 0) ? row : best,
    );
    return {
      id: 'population-day-of-week',
      type: 'BAR',
      title: '요일별 유동인구',
      description:
        peak.value === null
          ? fallbackDescription
          : `${peak.label} 유동인구가 ${peak.value.toLocaleString('ko-KR')}명으로 가장 많습니다.`,
      unit: '명',
      categories: rows.map((row) => row.label),
      series: [{ name: '유동인구', values: rows.map((row) => row.value) }],
      statisticsPeriod: this.chartPeriod(packet.population.sourcePeriod),
    };
  }

  private buildBusinessComparisonChart(
    packet: RecommendationEvidencePacket,
    businessCategoryCode: string,
  ): RecommendationChart | null {
    const rows = packet.commerce.candidates.filter(
      (candidate) =>
        candidate.demandScore !== null && candidate.competitionScore !== null,
    );
    if (rows.length < 3) return null;
    return {
      id: `business-comparison-${businessCategoryCode}`,
      type: 'BAR',
      title: '후보 업종 비교',
      description: '후보 업종의 수요와 경쟁 지표를 같은 기준으로 비교했습니다.',
      unit: '점',
      categories: rows.map((candidate) => candidate.name),
      series: [
        {
          name: '수요 적합도',
          values: rows.map((candidate) => candidate.demandScore),
        },
        {
          name: '경쟁 강도',
          values: rows.map((candidate) => candidate.competitionScore),
        },
      ],
      statisticsPeriod: this.chartPeriod(packet.commerce.sourcePeriod),
    };
  }

  private chartPeriod(sourcePeriod: string | null): {
    from: string | null;
    to: string | null;
  } {
    return sourcePeriod
      ? { from: sourcePeriod, to: sourcePeriod }
      : { from: null, to: null };
  }

  private formatTimeRange(value: string): string {
    const [from, to] = value.split('-');
    if (!from || !to) return value;
    return `${from.slice(0, 2)}~${to.slice(0, 2)}시`;
  }

  private async publishToolStarted(requestId: string): Promise<void> {
    for (const toolName of [
      'resolve_building_trade_area',
      'get_local_commerce_evidence',
      'get_population_evidence',
      'get_business_profiles',
    ]) {
      await this.eventService.publish(requestId, 'tool_started', { toolName });
    }
  }

  private async publishToolCompleted(
    requestId: string,
    packet: RecommendationEvidencePacket,
  ): Promise<void> {
    const completed = [
      {
        toolName: 'resolve_building_trade_area',
        evidenceCount: packet.building.commercialAreas.length + 1,
        sourcePeriod: null,
      },
      {
        toolName: 'get_local_commerce_evidence',
        evidenceCount: packet.commerce.candidates.length + 1,
        sourcePeriod: packet.commerce.sourcePeriod,
      },
      {
        toolName: 'get_population_evidence',
        evidenceCount: 1,
        sourcePeriod: packet.population.sourcePeriod,
      },
      {
        toolName: 'get_business_profiles',
        evidenceCount: packet.profiles.length,
        sourcePeriod: 'hackathon-v1',
      },
    ];
    for (const tool of completed) {
      await this.eventService.publish(requestId, 'tool_completed', tool);
    }
  }

  private async fail(requestId: string, error: unknown): Promise<void> {
    const normalized = this.normalizeError(error);
    this.logger.error(
      `Recommendation request ${requestId} failed: ${normalized.code}`,
      error instanceof Error ? error.stack : undefined,
    );
    await this.requestRepository.update(requestId, {
      status: 'FAILED',
      currentStage: 'FAILED',
      progress: 100,
      failedAt: new Date(),
      failureCode: normalized.code,
      failureMessage: normalized.message,
      updatedAt: new Date(),
      leaseOwner: null,
      leaseExpiresAt: null,
    });
    await this.publishTerminalEventSafely(requestId, 'failed', {
      code: normalized.code,
      message: normalized.message,
      retryable: normalized.retryable,
    });
  }

  private async publishProgress(
    requestId: string,
    status: RecommendationStatus,
    stage: RecommendationStage | 'COMPLETED',
    progress: number,
    message: string,
  ): Promise<void> {
    await this.requestRepository.update(requestId, {
      status,
      currentStage: stage,
      progress,
      updatedAt: new Date(),
      leaseExpiresAt: new Date(Date.now() + LEASE_MINUTES * 60_000),
    });
    await this.eventService.publish(requestId, 'progress', {
      stage,
      progress,
      message,
    });
  }

  private async publishTerminalEventSafely(
    requestId: string,
    eventType: 'completed' | 'failed',
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.eventService.publish(requestId, eventType, payload);
    } catch (error) {
      this.logger.error(
        `Recommendation request ${requestId} persisted as ${eventType}, but its SSE event could not be saved: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async findOwned(
    requestId: string,
    userId: string,
  ): Promise<RecommendationRequest> {
    const request = await this.requestRepository.findOne({
      where: { id: requestId, userId },
    });
    if (!request)
      throw new NotFoundException('추천 분석 요청을 찾을 수 없습니다.');
    return request;
  }

  private async assertUserExists(userId: string): Promise<void> {
    const [row] = await this.dataSource.query<{ id: string }[]>(
      'SELECT id::text AS id FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId],
    );
    if (!row) {
      throw new RecommendationFlowError(
        'AUTHENTICATED_USER_NOT_FOUND',
        '인증된 사용자를 찾을 수 없습니다.',
        401,
      );
    }
  }

  private async assertBuildingExists(buildingId: string): Promise<void> {
    const [row] = await this.dataSource.query<{ id: string }[]>(
      'SELECT id::text AS id FROM building WHERE id = $1',
      [buildingId],
    );
    if (!row) throw new NotFoundException('건물을 찾을 수 없습니다.');
  }

  private toAcceptedResponse(
    request: RecommendationRequest,
  ): Record<string, unknown> {
    return {
      requestId: request.id,
      status: request.status,
      eventsUrl: `/api/v1/recommendation-requests/${request.id}/events`,
      resultUrl: `/api/v1/recommendation-requests/${request.id}`,
    };
  }

  private normalizeError(error: unknown): {
    code: string;
    message: string;
    retryable: boolean;
  } {
    if (error instanceof RecommendationFlowError) {
      return {
        code: error.code,
        message: error.message,
        retryable:
          error.code === 'MCP_TIMEOUT' || error.code === 'MODEL_TIMEOUT',
      };
    }
    if (error instanceof Error && error.name === 'INSUFFICIENT_EVIDENCE') {
      return {
        code: 'INSUFFICIENT_EVIDENCE',
        message: error.message,
        retryable: false,
      };
    }
    if (error instanceof Error && error.name === 'BUILDING_NOT_FOUND') {
      return {
        code: 'BUILDING_NOT_FOUND',
        message: error.message,
        retryable: false,
      };
    }
    if (
      error instanceof Error &&
      error.name === 'RECOMMENDATION_AGENT_NOT_CONFIGURED'
    ) {
      return {
        code: 'RECOMMENDATION_AGENT_NOT_CONFIGURED',
        message: 'AI 추천 에이전트 설정이 완료되지 않았습니다.',
        retryable: false,
      };
    }
    if (error instanceof Error && error.name === 'CODEX_AGENT_RUNNER_ERROR') {
      return {
        code: 'CODEX_AGENT_RUNNER_ERROR',
        message:
          'Codex 작업 컨테이너 실행에 실패했습니다. 서버 로그를 확인하세요.',
        retryable: true,
      };
    }
    if (error instanceof Error && error.name === 'AGENT_RESULT_NOT_AVAILABLE') {
      return {
        code: 'AGENT_RESULT_NOT_AVAILABLE',
        message:
          'AI 분석 작업은 종료됐지만 결과 저장 확인이 지연되고 있습니다. 다시 시도해 주세요.',
        retryable: true,
      };
    }
    if (error instanceof Error && error.name === 'INVALID_MODEL_OUTPUT') {
      return {
        code: 'INVALID_MODEL_OUTPUT',
        message: 'AI 추천 결과 형식 검증에 실패했습니다.',
        retryable: false,
      };
    }
    return {
      code: 'RECOMMENDATION_ANALYSIS_FAILED',
      message: '추천 분석 중 오류가 발생했습니다.',
      retryable: true,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }

  private isRetryableAgentError(error: unknown): boolean {
    return (
      error instanceof Error &&
      [
        'MODEL_TIMEOUT',
        'MCP_TIMEOUT',
        'CODEX_AGENT_RUNNER_ERROR',
        'AGENT_RESULT_NOT_AVAILABLE',
      ].includes(error.name)
    );
  }

  private unwrapRows<T>(value: unknown): T[] {
    if (Array.isArray(value) && value.length === 2 && Array.isArray(value[0])) {
      return value[0] as T[];
    }
    return value as T[];
  }
}
