import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RecommendationRequest,
      RecommendationEvent,
      RecommendationEvidenceSnapshot,
      SpaceBusinessRecommendationResult,
    ]),
  ],
  controllers: [RecommendationController],
  providers: [
    RecommendationEventService,
    RecommendationStreamService,
    RecommendationOrchestratorService,
    SqlRecommendationEvidenceCollector,
    DeterministicRecommendationAgent,
    CodexCliRecommendationAgent,
    EcsCodexRecommendationAgent,
    OpenAiResponsesRecommendationAgent,
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
