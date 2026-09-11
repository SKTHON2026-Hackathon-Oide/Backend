import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AdministrativeAreasModule } from '../administrative-areas/administrative-areas.module';
import { RECOMMENDATION_AGENT } from './domain/ports/recommendation-agent.port';
import { DeterministicRecommendationAgent } from './infrastructure/agents/deterministic-recommendation-agent';
import { CodexCliRecommendationAgent } from './infrastructure/agents/codex-cli-recommendation-agent';
import { EcsCodexRecommendationAgent } from './infrastructure/agents/ecs-codex-recommendation-agent';
import { OpenAiResponsesRecommendationAgent } from './infrastructure/agents/openai-responses-recommendation-agent';
import { SqlRecommendationEvidenceCollector } from './infrastructure/evidence/sql-recommendation-evidence.collector';
import { RecommendationEvent } from './infrastructure/persistence/typeorm/entities/recommendation-event.entity';
import { RecommendationEvidenceSnapshot } from './infrastructure/persistence/typeorm/entities/recommendation-evidence-snapshot.entity';
import { RecommendationRequest } from './infrastructure/persistence/typeorm/entities/recommendation-request.entity';
import { SpaceBusinessRecommendationResult } from './infrastructure/persistence/typeorm/entities/space-business-recommendation-result.entity';
import { RecommendationEventService } from './applications/services/recommendation-event.service';
import { RecommendationOrchestratorService } from './applications/services/recommendation-orchestrator.service';
import { RecommendationStreamService } from './applications/services/recommendation-stream.service';
import { RecommendationController } from './interfaces/http/recommendation.controller';
import { BusinessLocationRecommendationController } from './interfaces/http/business-location-recommendation.controller';
import { BusinessLocationRecommendationResult } from './infrastructure/persistence/typeorm/entities/business-location-recommendation-result.entity';
import { SqlBusinessLocationEvidenceCollector } from './infrastructure/evidence/sql-business-location-evidence.collector';
import { DeterministicBusinessLocationRecommendationAgent } from './infrastructure/agents/deterministic-business-location-recommendation-agent';
import { OpenAiBusinessLocationRecommendationAgent } from './infrastructure/agents/openai-business-location-recommendation-agent';
import { CodexBusinessLocationRecommendationAgent } from './infrastructure/agents/codex-business-location-recommendation-agent';
import { EcsCodexBusinessLocationRecommendationAgent } from './infrastructure/agents/ecs-codex-business-location-recommendation-agent';
import { BusinessLocationRecommendationOrchestratorService } from './applications/services/business-location-recommendation-orchestrator.service';

@Module({
  imports: [
    AuthModule,
    AdministrativeAreasModule,
    TypeOrmModule.forFeature([
      RecommendationRequest,
      RecommendationEvent,
      RecommendationEvidenceSnapshot,
      SpaceBusinessRecommendationResult,
      BusinessLocationRecommendationResult,
    ]),
  ],
  controllers: [
    RecommendationController,
    BusinessLocationRecommendationController,
  ],
  providers: [
    RecommendationEventService,
    RecommendationStreamService,
    RecommendationOrchestratorService,
    SqlRecommendationEvidenceCollector,
    DeterministicRecommendationAgent,
    CodexCliRecommendationAgent,
    EcsCodexRecommendationAgent,
    OpenAiResponsesRecommendationAgent,
    SqlBusinessLocationEvidenceCollector,
    DeterministicBusinessLocationRecommendationAgent,
    OpenAiBusinessLocationRecommendationAgent,
    CodexBusinessLocationRecommendationAgent,
    EcsCodexBusinessLocationRecommendationAgent,
    BusinessLocationRecommendationOrchestratorService,
    {
      provide: RECOMMENDATION_AGENT,
      inject: [
        ConfigService,
        DeterministicRecommendationAgent,
        CodexCliRecommendationAgent,
        EcsCodexRecommendationAgent,
        OpenAiResponsesRecommendationAgent,
      ],
      useFactory: (
        config: ConfigService,
        deterministicAgent: DeterministicRecommendationAgent,
        codexAgent: CodexCliRecommendationAgent,
        ecsCodexAgent: EcsCodexRecommendationAgent,
        openAiAgent: OpenAiResponsesRecommendationAgent,
      ) => {
        const mode = config.get<string>(
          'RECOMMENDATION_AGENT_MODE',
          'deterministic',
        );
        if (mode === 'codex') {
          return config.get<string>('RECOMMENDATION_AGENT_RUNNER', 'local') ===
            'ecs'
            ? ecsCodexAgent
            : codexAgent;
        }
        if (mode === 'openai') return openAiAgent;
        return deterministicAgent;
      },
    },
  ],
  exports: [TypeOrmModule],
})
export class RecommendationsModule {}
