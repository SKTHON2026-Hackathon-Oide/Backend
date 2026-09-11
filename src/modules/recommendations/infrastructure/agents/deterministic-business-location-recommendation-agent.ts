import { Injectable } from '@nestjs/common';
import {
  BUSINESS_LOCATION_SCORE_WEIGHTS,
  BusinessLocationCandidate,
  BusinessLocationEvidencePacket,
  BusinessLocationRecommendation,
  BusinessLocationRecommendationOutput,
  BusinessLocationScoreBreakdown,
} from '../../domain/business-location-recommendation.types';
import type { BusinessLocationRecommendationAgentPort } from '../../domain/ports/business-location-recommendation-agent.port';

const clamp = (value: number) =>
  Math.max(0, Math.min(100, Math.round(value * 10) / 10));
const average = (values: number[]) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 50;
const n = (value: number | null, fallback = 50) =>
  value === null ? fallback : value;

@Injectable()
export class DeterministicBusinessLocationRecommendationAgent implements BusinessLocationRecommendationAgentPort {
  async generate(
    packet: BusinessLocationEvidencePacket,
  ): Promise<BusinessLocationRecommendationOutput> {
    await Promise.resolve();
    if (!packet.candidates.length) {
      const error = new Error(
        '선택 지역에서 분석 가능한 상권 통계가 없습니다.',
      );
      error.name = 'INSUFFICIENT_EVIDENCE';
      throw error;
    }
    const ranked = this.getServerRecommendations(packet).slice(0, 5);
    return {
      summary: `${packet.input.preferredArea.name}에서 ${packet.input.businessCategoryName} 업종의 상권 통계를 비교해 ${ranked.length}개 후보를 추천했습니다.`,
      recommendations: ranked.map((item, index) => ({
        ...item,
        rank: index + 1,
      })),
      warnings: packet.missingData.map((item) => item.reason),
      dataLimitations: packet.missingData.map((item) => item.reason),
      dataAsOf: packet.dataAsOf,
    };
  }

  getServerRecommendations(
    packet: BusinessLocationEvidencePacket,
  ): BusinessLocationRecommendation[] {
    return packet.candidates
      .map((candidate) => this.score(candidate, packet))
      .sort(
        (a, b) =>
          b.totalScore - a.totalScore ||
          a.commercialAreaCode.localeCompare(b.commercialAreaCode),
      );
  }

  private score(
    candidate: BusinessLocationCandidate,
    packet: BusinessLocationEvidencePacket,
  ): BusinessLocationRecommendation {
    const demand = clamp(
      n(
        candidate.demandScore,
        average([
          n(
            candidate.estimatedSalesAmount === null
              ? null
              : candidate.estimatedSalesAmount / 1_000_000,
            50,
          ),
          n(
            candidate.population.total === null
              ? null
              : candidate.population.total / 10_000,
            50,
          ),
        ]),
      ),
    );
    const supplyOpportunity =
      candidate.storeCount === null
        ? 50
        : clamp(
            85 -
              Math.min(candidate.storeCount, 100) * 0.7 +
              n(candidate.demandScore, 50) * 0.15,
          );
    const customerFit = candidate.profile ? this.customerFit(candidate) : 45;
    const timeFit = this.timeFit(candidate, packet.input.operatingHours);
    const competitionHealth =
      candidate.competitionScore === null
        ? 50
        : clamp(
            100 -
              candidate.competitionScore * 0.7 -
              n(candidate.closureRate, 0) * 20,
          );
    const dataConfidence = clamp(
      50 +
        (candidate.demandScore !== null ? 15 : 0) +
        (candidate.population.total !== null ? 15 : 0) +
        (candidate.profile ? 20 : 0),
    );
    const scoreBreakdown: BusinessLocationScoreBreakdown = {
      demand,
      supplyOpportunity,
      customerFit,
      timeFit,
      competitionHealth,
      dataConfidence,
    };
    const totalScore = clamp(
      (demand * BUSINESS_LOCATION_SCORE_WEIGHTS.demand +
        supplyOpportunity * BUSINESS_LOCATION_SCORE_WEIGHTS.supplyOpportunity +
        customerFit * BUSINESS_LOCATION_SCORE_WEIGHTS.customerFit +
        timeFit * BUSINESS_LOCATION_SCORE_WEIGHTS.timeFit +
        competitionHealth * BUSINESS_LOCATION_SCORE_WEIGHTS.competitionHealth +
        dataConfidence * BUSINESS_LOCATION_SCORE_WEIGHTS.dataConfidence) /
        100,
    );
    const matched = this.matchedTimeBands(
      candidate,
      packet.input.operatingHours,
    );
    return {
      rank: 0,
      commercialAreaId: candidate.commercialAreaId,
      commercialAreaCode: candidate.commercialAreaCode,
      commercialAreaName: candidate.commercialAreaName,
      administrativeArea: {
        code: candidate.administrativeAreaCode,
        name: candidate.administrativeAreaName,
      },
      longitude: candidate.longitude,
      latitude: candidate.latitude,
      totalScore,
      scoreBreakdown,
      oneLineReason: `${candidate.commercialAreaName}은 수요 ${demand.toFixed(1)}점, 영업시간 적합도 ${timeFit.toFixed(1)}점으로 평가됩니다.`,
      evidence: [
        {
          metric: '수요 점수',
          value: candidate.demandScore,
          unit: '점',
          interpretation:
            candidate.demandScore === null
              ? '수요 점수가 없어 매출·인구 지표를 보수적으로 반영했습니다.'
              : `선택 업종의 상권 수요를 ${candidate.demandScore.toFixed(1)}점으로 반영했습니다.`,
        },
        {
          metric: '동일 업종 점포 수',
          value: candidate.storeCount,
          unit: '개',
          interpretation:
            candidate.storeCount === null
              ? '점포 수가 없어 공급 기회를 중립적으로 평가했습니다.'
              : `동일 업종 점포 ${candidate.storeCount.toLocaleString('ko-KR')}개를 기준으로 공급 기회를 평가했습니다.`,
        },
        {
          metric: '유동인구',
          value: candidate.population.total,
          unit: '명',
          interpretation:
            candidate.population.total === null
              ? '유동인구 결측으로 고객층 적합도 신뢰도가 낮습니다.'
              : `최근 유동인구 ${candidate.population.total.toLocaleString('ko-KR')}명이 고객 유입 기반으로 반영되었습니다.`,
        },
        {
          metric: '영업시간 유동인구',
          value: matched.length ? matched.join(', ') : null,
          unit: null,
          interpretation: matched.length
            ? `${matched.join(', ')} 시간대가 입력 영업시간과 겹쳐 시간대 적합도에 반영되었습니다.`
            : '입력 영업시간과 확인 가능한 유동인구 시간대가 충분히 겹치지 않습니다.',
        },
      ],
      operatingHourFit: {
        score: timeFit,
        matchedTimeBands: matched,
        explanation: matched.length
          ? `${matched.join(', ')}의 유동인구를 입력 영업시간과 비교했습니다.`
          : '입력 영업시간과 겹치는 유동인구 시간대가 없습니다.',
      },
      risks: [
        candidate.closureRate === null
          ? '폐업률 결측 → 경쟁 건전성 판단이 제한되므로 실제 점포 유지기간을 추가 확인해야 합니다.'
          : `관측 폐업률 ${candidate.closureRate.toFixed(1)}% → 업종 유지 위험을 점검하고 최근 점포 변화를 확인해야 합니다.`,
        candidate.storeCount === null
          ? '동일 업종 점포 수 결측 → 경쟁 규모를 확정할 수 없으므로 현장 조사가 필요합니다.'
          : `동일 업종 점포 ${candidate.storeCount.toLocaleString('ko-KR')}개 → 경쟁이 집중될 수 있어 차별화 요소를 검토해야 합니다.`,
      ],
      operatingTips: [
        matched.length
          ? `${matched.join(', ')}에 유동인구가 확인되어 해당 시간대에 대표 상품과 인력을 집중하는 방안을 검토할 수 있습니다.`
          : '유동인구가 확인된 시간대가 제한적이므로 실제 방문객 패턴을 사전 확인해야 합니다.',
        candidate.profile?.targetAgeGroups.length
          ? `${candidate.profile.targetAgeGroups.join(', ')} 고객층을 고려해 메뉴·가격·홍보 채널을 맞추는 것이 좋습니다.`
          : '업종 고객 프로파일이 없어 초기에는 고객층별 반응을 별도로 측정하는 것이 좋습니다.',
      ],
      evidenceIds: candidate.evidenceIds,
    };
  }

  private customerFit(candidate: BusinessLocationCandidate): number {
    const groups = Object.entries(candidate.population.ageGroups).filter(
      ([, value]) => value !== null,
    );
    if (!groups.length || !candidate.profile) return 45;
    const total = groups.reduce((sum, [, value]) => sum + (value ?? 0), 0);
    const target = groups
      .filter(([key]) => candidate.profile?.targetAgeGroups.includes(key))
      .reduce((sum, [, value]) => sum + (value ?? 0), 0);
    return clamp(total ? (target / total) * 100 : 45);
  }

  private timeFit(
    candidate: BusinessLocationCandidate,
    hours: { opensAt: string; closesAt: string },
  ): number {
    const matched = this.matchedTimeBands(candidate, hours);
    const available = candidate.population.timeBands.filter(
      (band) => band.population !== null,
    );
    if (!available.length) return 50;
    const peak = Math.max(...available.map((band) => band.population ?? 0));
    const value = matched.reduce(
      (sum, range) =>
        sum +
        (candidate.population.timeBands.find((band) => band.timeRange === range)
          ?.population ?? 0),
      0,
    );
    return clamp(
      available.length
        ? (value / Math.max(peak * Math.max(matched.length, 1), 1)) * 100
        : 50,
    );
  }

  private matchedTimeBands(
    candidate: BusinessLocationCandidate,
    hours: { opensAt: string; closesAt: string },
  ): string[] {
    const start = this.minutes(hours.opensAt);
    const end = this.minutes(hours.closesAt);
    return candidate.population.timeBands
      .filter((band) => {
        const [from, to] = band.timeRange
          .split('-')
          .map((value) => this.minutes(value));
        const overnight = end <= start;
        return overnight
          ? from >= start || to <= end
          : from < end && to > start;
      })
      .map((band) => band.timeRange);
  }

  private minutes(value: string): number {
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
  }
}
