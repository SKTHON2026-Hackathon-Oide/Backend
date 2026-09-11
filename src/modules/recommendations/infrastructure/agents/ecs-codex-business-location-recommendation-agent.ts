import { Injectable } from '@nestjs/common';
import type {
  BusinessLocationEvidencePacket,
  BusinessLocationRecommendationOutput,
} from '../../domain/business-location-recommendation.types';
import type { BusinessLocationRecommendationAgentPort } from '../../domain/ports/business-location-recommendation-agent.port';
import { EcsCodexRecommendationAgent } from './ecs-codex-recommendation-agent';

@Injectable()
export class EcsCodexBusinessLocationRecommendationAgent implements BusinessLocationRecommendationAgentPort {
  constructor(private readonly runner: EcsCodexRecommendationAgent) {}

  generate(
    packet: BusinessLocationEvidencePacket,
  ): Promise<BusinessLocationRecommendationOutput> {
    return this.runner.generateBusinessLocation(packet);
  }
}
