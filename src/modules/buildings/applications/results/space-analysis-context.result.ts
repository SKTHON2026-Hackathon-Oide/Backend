import { BuildingCandidate } from '../../domain/ports/building-search.port';
import { SpaceAnalysisContextStatus } from '../../domain/enums/space-analysis-context-status.enum';
import { BuildingRegistryResult } from './building-registry.result';

export interface SpaceAnalysisContextResult {
  contextId: string;
  status: SpaceAnalysisContextStatus;
  point: {
    longitude: number;
    latitude: number;
  };
  candidates: BuildingCandidate[];
  selectedBuildingId: string | null;
  expiresAt: string;
  registry?: BuildingRegistryResult;
}
