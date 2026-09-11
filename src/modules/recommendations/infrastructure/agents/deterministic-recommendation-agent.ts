import { Injectable } from '@nestjs/common';
import {
  BusinessProfileEvidence,
  CommerceCandidateEvidence,
  PopulationBand,
  RecommendationEvidence,
  RecommendationAgentOutput,
  RecommendationEvidencePacket,
  ScoreBreakdown,
  SCORE_WEIGHTS,
} from '../../domain/recommendation.types';
import type { RecommendationAgentPort } from '../../domain/ports/recommendation-agent.port';

const clamp = (value: number): number =>
  Math.max(0, Math.min(100, Math.round(value * 10) / 10));

const average = (values: number[]): number =>
  values.length === 0
    ? 50
    : values.reduce((sum, value) => sum + value, 0) / values.length;

const normalize = (value: number | null, max: number): number | null =>
  value === null ? null : clamp((value / Math.max(max, 1)) * 100);

const timeRangeToBand = (range: string): string | null => {
  const mappings: Record<string, string> = {
    TIME_00_06: '00:00-06:00',
    TIME_06_11: '06:00-11:00',
    TIME_11_14: '11:00-14:00',
    TIME_14_17: '14:00-17:00',
    TIME_17_21: '17:00-21:00',
    TIME_21_24: '21:00-24:00',
  };
  return mappings[range] ?? (range.includes('-') ? range : null);
};

interface ScoredCandidate {
  rank: number;
  businessCategoryCode: string;
  businessCategoryName: string;
  totalScore: number;
  scoreBreakdown: ScoreBreakdown;
  recommendedOperatingHours: string[];
  reasons: string[];
  risks: string[];
  evidenceIds: string[];
}

@Injectable()
export class DeterministicRecommendationAgent implements RecommendationAgentPort {
  getServerScores(packet: RecommendationEvidencePacket): Map<string, number> {
    const profileByCode = new Map(
      packet.profiles.map((profile) => [profile.code, profile]),
    );
    return new Map(
      packet.commerce.candidates.map((candidate) => [
        candidate.code,
        this.scoreCandidate(
          candidate,
          profileByCode.get(candidate.code),
          packet,
        ).totalScore,
      ]),
    );
  }

  generate(
    packet: RecommendationEvidencePacket,
  ): Promise<RecommendationAgentOutput> {
    if (packet.commerce.candidates.length === 0) {
      const error = new Error('추천 후보 업종을 만들 수 있는 통계가 없습니다.');
      error.name = 'INSUFFICIENT_EVIDENCE';
      throw error;
    }

    const profileByCode = new Map(
      packet.profiles.map((profile) => [profile.code, profile]),
    );
    const scored = packet.commerce.candidates
      .map((candidate) =>
        this.scoreCandidate(
          candidate,
          profileByCode.get(candidate.code),
          packet,
        ),
      )
      .sort((left, right) => {
        if (right.totalScore !== left.totalScore) {
          return right.totalScore - left.totalScore;
        }
        return left.businessCategoryCode.localeCompare(
          right.businessCategoryCode,
        );
      })
      .slice(0, 5);

    return Promise.resolve({
      summary: `${packet.building.address ?? '대상 건물'} 주변 상권·유동인구 통계를 기준으로 ${scored.length}개 업종을 비교했습니다.`,
      selectedCommercialArea: this.selectedCommercialArea(packet),
      recommendations: scored.map((candidate, index) =>
        this.toRecommendation(candidate, index + 1, packet),
      ),
      warnings: packet.missingData.map(
        (missing) => `${missing.key}: ${missing.reason}`,
      ),
      dataLimitations: packet.missingData.map((missing) => missing.reason),
    });
  }

  private scoreCandidate(
    candidate: CommerceCandidateEvidence,
    profile: BusinessProfileEvidence | undefined,
    packet: RecommendationEvidencePacket,
  ): ScoredCandidate {
    const demand = clamp(
      candidate.demandScore ??
        average([
          normalize(candidate.estimatedSalesAmount, 100_000_000) ?? 50,
          normalize(packet.population.totalPopulation, 1_000_000) ?? 50,
        ]),
    );
    const storeCount = candidate.storeCount ?? candidate.nearbyStoreCount;
    const supplyOpportunity =
      storeCount === null
        ? 50
        : clamp(
            75 -
              Math.min(storeCount, 50) * 1.1 +
              (candidate.demandScore ?? 50) * 0.25,
          );
    const customerFit = profile ? this.customerFit(profile, packet) : 45;
    const timeFit = profile
      ? this.timeFit(profile, packet.population.timeBands)
      : 50;
    const competitionHealth =
      candidate.competitionScore === null
        ? 50
        : clamp(
            100 -
              candidate.competitionScore * 0.7 -
              (candidate.closureRate ?? 0) * 20,
          );
    const dataConfidence = this.dataConfidence(candidate, profile, packet);
    const scoreBreakdown: ScoreBreakdown = {
      demand,
      supplyOpportunity,
      customerFit,
      timeFit,
      competitionHealth,
      dataConfidence,
    };
    const totalScore = clamp(
      (demand * SCORE_WEIGHTS.demand +
        supplyOpportunity * SCORE_WEIGHTS.supplyOpportunity +
        customerFit * SCORE_WEIGHTS.customerFit +
        timeFit * SCORE_WEIGHTS.timeFit +
        competitionHealth * SCORE_WEIGHTS.competitionHealth +
        dataConfidence * SCORE_WEIGHTS.dataConfidence) /
        100,
    );
    const evidenceIds = [
      packet.building.evidenceId,
      packet.commerce.evidenceId,
      candidate.evidenceId,
      packet.population.evidenceId,
      ...(profile ? [profile.evidenceId] : []),
    ];
    const recommendedOperatingHours = this.recommendedHours(profile, packet);
    const nearbyStoreEvidence =
      candidate.nearbyStoreCount === null
        ? '주변 점포 수 데이터가 결측인 상태'
        : `주변 확인 점포 수 ${candidate.nearbyStoreCount.toLocaleString('ko-KR')}개`;

    return {
      rank: 0,
      businessCategoryCode: candidate.code,
      businessCategoryName: candidate.name,
      totalScore,
      scoreBreakdown,
      recommendedOperatingHours,
      reasons: [
        `수요 점수 ${this.format(candidate.demandScore)}와 분석 기간 유동인구 ${this.format(packet.population.totalPopulation)}명을 반영했습니다.`,
        `${nearbyStoreEvidence}를 공급 기회 점수와 함께 비교했습니다.`,
        profile
          ? `업종 profile의 목표 고객층과 피크 시간대를 실제 상권 분포와 대조했습니다.`
          : '해당 업종의 profile이 없어 일반 기준으로 보수적으로 평가했습니다.',
      ],
      risks: [
        ...(candidate.closureRate !== null
          ? [
              `관측 폐업률 ${this.format(candidate.closureRate)}의 해석에는 통계 기준 시점 차이가 있을 수 있습니다.`,
            ]
          : ['폐업률 데이터가 없어 경쟁 건전성 판단의 불확실성이 있습니다.']),
        ...(profile
          ? []
          : ['업종 profile 결측으로 고객층·시간대 적합도 신뢰도가 낮습니다.']),
      ],
      evidenceIds,
    };
  }

  private selectedCommercialArea(packet: RecommendationEvidencePacket): {
    code: string | null;
    name: string | null;
    matchMethod: 'OVERLAP' | 'NEAREST' | null;
    overlapRatio: number | null;
    distanceMeters: number | null;
  } {
    const area = packet.building.commercialAreas[0];
    if (!area) {
      return {
        code: null,
        name: null,
        matchMethod: null,
        overlapRatio: null,
        distanceMeters: null,
      };
    }
    return {
      code: area.code,
      name: area.name,
      matchMethod: area.relation === 'DIRECT' ? 'OVERLAP' : 'NEAREST',
      overlapRatio: area.overlapRatio,
      distanceMeters: area.distanceMeters ?? null,
    };
  }

  private toRecommendation(
    candidate: ScoredCandidate,
    rank: number,
    packet: RecommendationEvidencePacket,
  ) {
    const profile = packet.profiles.find(
      (item) => item.code === candidate.businessCategoryCode,
    );
    const evidence: RecommendationEvidence[] = [
      this.evidence(
        'DEMAND',
        'demandScore',
        candidate.scoreBreakdown.demand,
        'score',
        packet.commerce.sourcePeriod,
        `수요 점수 ${candidate.scoreBreakdown.demand}를 반영했습니다.`,
      ),
      this.evidence(
        'COMPETITION',
        'storeCount',
        candidate.evidenceIds.length > 0
          ? (packet.commerce.candidates.find(
              (item) => item.code === candidate.businessCategoryCode,
            )?.storeCount ?? null)
          : null,
        '개',
        packet.commerce.sourcePeriod,
        '상권 단위 업종 점포 수입니다.',
      ),
      this.evidence(
        'POPULATION',
        'totalPopulation',
        packet.population.totalPopulation,
        '명',
        packet.population.sourcePeriod,
        '연결 상권의 최신 유동인구 합계입니다.',
      ),
    ];
    if (profile) {
      evidence.push(
        this.evidence(
          'PROFILE',
          'profileConfidence',
          profile.confidenceLevel,
          null,
          'hackathon-v1',
          `업종 프로필 신뢰도는 ${profile.confidenceLevel}입니다.`,
        ),
      );
    }
    if (candidate.risks.length > 0) {
      evidence.push(
        this.evidence(
          'RISK',
          'closureRate',
          packet.commerce.candidates.find(
            (item) => item.code === candidate.businessCategoryCode,
          )?.closureRate ?? null,
          '%',
          packet.commerce.sourcePeriod,
          candidate.risks[0],
        ),
      );
    }
    return {
      rank,
      businessCategoryCode: candidate.businessCategoryCode,
      businessCategoryName: candidate.businessCategoryName,
      totalScore: candidate.totalScore,
      confidence: candidate.scoreBreakdown.dataConfidence / 100,
      oneLineReason:
        candidate.reasons[0] ?? '수집된 근거를 기준으로 비교했습니다.',
      evidence,
      risks: candidate.risks,
      operatingTips: candidate.recommendedOperatingHours,
    };
  }

  private evidence(
    type: RecommendationEvidence['type'],
    metric: string,
    value: string | number | Record<string, unknown> | null,
    unit: string | null,
    sourcePeriod: string | null,
    interpretation: string,
  ): RecommendationEvidence {
    const period = /^\d{4}-\d{2}-\d{2}$/.test(sourcePeriod ?? '')
      ? { from: sourcePeriod, to: sourcePeriod }
      : { from: null, to: null };
    return {
      type,
      metric,
      value,
      unit,
      statisticsPeriod: period,
      interpretation,
    };
  }

  private customerFit(
    profile: BusinessProfileEvidence,
    packet: RecommendationEvidencePacket,
  ): number {
    const values = profile.targetAgeGroups
      .map((ageGroup) => packet.population.ageGroups[ageGroup])
      .filter(
        (value): value is number => value !== null && value !== undefined,
      );
    const total = packet.population.totalPopulation;
    if (values.length === 0 || total === null || total <= 0) return 45;
    return clamp((values.reduce((sum, value) => sum + value, 0) / total) * 100);
  }

  private timeFit(
    profile: BusinessProfileEvidence,
    timeBands: PopulationBand[],
  ): number {
    const peakRanges = profile.peakTimeRanges
      .map(timeRangeToBand)
      .filter((value): value is string => value !== null);
    const peakValues = timeBands
      .filter((band) => peakRanges.includes(band.timeRange))
      .map((band) => band.population)
      .filter((value): value is number => value !== null);
    const allValues = timeBands
      .map((band) => band.population)
      .filter((value): value is number => value !== null);
    if (peakValues.length === 0 || allValues.length === 0) return 45;
    return clamp((average(peakValues) / Math.max(...allValues)) * 100);
  }

  private dataConfidence(
    candidate: CommerceCandidateEvidence,
    profile: BusinessProfileEvidence | undefined,
    packet: RecommendationEvidencePacket,
  ): number {
    const measuredValues = [
      candidate.demandScore,
      candidate.storeCount,
      packet.population.totalPopulation,
    ].filter((value): value is number => value !== null);
    const base = (measuredValues.length / 3) * 70;
    const profileBonus = profile
      ? profile.confidenceLevel === 'HIGH'
        ? 30
        : profile.confidenceLevel === 'MEDIUM'
          ? 20
          : 10
      : 0;
    return clamp(base + profileBonus);
  }

  private recommendedHours(
    profile: BusinessProfileEvidence | undefined,
    packet: RecommendationEvidencePacket,
  ): string[] {
    const profileHours = (profile?.peakTimeRanges ?? [])
      .map(timeRangeToBand)
      .filter((value): value is string => value !== null);
    if (profileHours.length > 0) return [...new Set(profileHours)].slice(0, 3);
    return packet.population.timeBands
      .filter((band) => band.population !== null)
      .slice(0, 2)
      .map((band) => band.timeRange);
  }

  private format(value: number | null): string {
    return value === null ? '결측' : value.toLocaleString('ko-KR');
  }
}
