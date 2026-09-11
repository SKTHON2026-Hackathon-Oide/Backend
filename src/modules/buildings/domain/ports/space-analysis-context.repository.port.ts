import { SpaceAnalysisContext } from '../../infrastructure/persistence/typeorm/entities/space-analysis-context.entity';

export interface SpaceAnalysisContextRepository {
  create(context: SpaceAnalysisContext): Promise<SpaceAnalysisContext>;
  findOwnedById(
    contextId: string,
    userId: string,
  ): Promise<SpaceAnalysisContext | null>;
  save(context: SpaceAnalysisContext): Promise<SpaceAnalysisContext>;
}

export const SPACE_ANALYSIS_CONTEXT_REPOSITORY = Symbol(
  'SPACE_ANALYSIS_CONTEXT_REPOSITORY',
);
