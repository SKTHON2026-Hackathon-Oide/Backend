import {
  RecommendationAgentOutput,
  RecommendationEvidencePacket,
} from '../recommendation.types';

export interface RecommendationAgentContext {
  requestId: string;
  buildingId: string;
}

export interface RecommendationAgentPort {
  generate(
    packet: RecommendationEvidencePacket,
    context?: RecommendationAgentContext,
  ): Promise<RecommendationAgentOutput>;
}

export const RECOMMENDATION_AGENT = Symbol('RECOMMENDATION_AGENT');
