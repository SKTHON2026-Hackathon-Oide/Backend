import { BuildingRegistryStatus } from '../../domain/enums/building-registry-status.enum';
import { RegistrySpaceOption } from '../../domain/services/registry-space-option.service';
import { LedgerMatchCandidate } from '../../domain/services/building-ledger-match.service';

export interface BuildingRegistryResult {
  registryStatus: BuildingRegistryStatus;
  ledgerMatch: {
    buildingName: string | null;
    address: string | null;
    confidence: number | null;
    sourceAsOf: string | null;
  } | null;
  ambiguousCandidates: LedgerMatchCandidate[];
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
