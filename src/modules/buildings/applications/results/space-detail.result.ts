import { SpaceAnalysisMode } from '../../domain/enums/space-analysis-mode.enum';
import { SpaceDetailSource } from '../../domain/enums/space-detail-source.enum';

export interface SpaceDetailResult {
  contextId: string;
  status: string;
  analysisMode: SpaceAnalysisMode;
  source: SpaceDetailSource | null;
  selectedSpaceDetail: Record<string, unknown> | null;
  selectedBuildingId: string | null;
  expiresAt: string;
}
