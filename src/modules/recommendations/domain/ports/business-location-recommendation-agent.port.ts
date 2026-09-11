import {
  BusinessLocationEvidencePacket,
  BusinessLocationRecommendationOutput,
} from '../business-location-recommendation.types';

export interface BusinessLocationRecommendationAgentPort {
  generate(
    packet: BusinessLocationEvidencePacket,
  ): Promise<BusinessLocationRecommendationOutput>;
}

export const BUSINESS_LOCATION_RECOMMENDATION_AGENT = Symbol(
  'BUSINESS_LOCATION_RECOMMENDATION_AGENT',
);
