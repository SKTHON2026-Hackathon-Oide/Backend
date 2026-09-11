import { BuildingRegistryStatus } from '../../domain/enums/building-registry-status.enum';
import { RegistrySpaceOption } from '../../domain/services/registry-space-option.service';

export interface RegistryBuildingCandidate {
  registryKey: string;
  buildingName: string | null;
  address: string | null;
  score: number;
  reasons: string[];
}

export interface BuildingRegistryResult {
  registryStatus: BuildingRegistryStatus;
  ledgerMatch: {
    buildingName: string | null;
    address: string | null;
    confidence: number | null;
    sourceAsOf: string | null;
  } | null;
  ambiguousCandidates: RegistryBuildingCandidate[];
  housingPrice: {
    amount: number;
    sourceAsOf: string | null;
  } | null;
  spaceOptions: RegistrySpaceOption[];
  manualInputAllowed: boolean;
  isStale: boolean;
  errorCode: string | null;
  cacheId: string | null;
}
