import { BuildingRegistryStatus } from '../../domain/enums/building-registry-status.enum';
import { RegistrySpaceOption } from '../../domain/services/registry-space-option.service';

export interface RegistryBuildingCandidate {
  registryGroupKey: string;
  registryKeys: string[];
  buildingName: string | null;
  address: string | null;
  score: number;
  reasons: string[];
  spaceOptionCount: number;
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
  spaceOptionsPage: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  manualInputAllowed: boolean;
  isStale: boolean;
  errorCode: string | null;
  cacheId: string | null;
}
