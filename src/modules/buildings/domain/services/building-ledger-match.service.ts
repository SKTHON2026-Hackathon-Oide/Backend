import { BuildingForRegistry } from '../ports/building-lookup.port';
import { BuildingHubBasisRecord } from '../ports/building-registry.gateway.port';

export interface LedgerBuildingGroup {
  registryKey: string;
  buildingName: string | null;
  address: string | null;
  mainUseName: string | null;
  aboveGroundFloorCount: number | null;
  belowGroundFloorCount: number | null;
  totalFloorAreaSqm: number | null;
  dongNames: string[];
  basisRecords: BuildingHubBasisRecord[];
}

export interface LedgerMatchCandidate {
  group: LedgerBuildingGroup;
  score: number;
  reasons: string[];
}

export interface LedgerMatchResult {
  status: 'MATCHED' | 'AMBIGUOUS' | 'NOT_FOUND';
  selected: LedgerMatchCandidate | null;
  candidates: LedgerMatchCandidate[];
}

export class BuildingLedgerMatchService {
  private static readonly AUTO_MATCH_MIN_SCORE = 55;
  private static readonly AUTO_MATCH_MIN_GAP = 10;

  group(records: BuildingHubBasisRecord[]): LedgerBuildingGroup[] {
    const groups = new Map<string, LedgerBuildingGroup>();

    for (const record of records) {
      const registryKey =
        record.mgmBldrgstPk ??
        `${this.normalize(record.address)}|${this.normalize(record.buildingName)}`;
      const current = groups.get(registryKey);
      if (current) {
        if (
          record.sourceCreatedAt &&
          !current.basisRecords[0]?.sourceCreatedAt
        ) {
          current.basisRecords.unshift(record);
        } else {
          current.basisRecords.push(record);
        }
        continue;
      }

      groups.set(registryKey, {
        registryKey,
        buildingName: record.buildingName,
        address: record.address,
        mainUseName: record.mainUseName,
        aboveGroundFloorCount: record.aboveGroundFloorCount,
        belowGroundFloorCount: record.belowGroundFloorCount,
        totalFloorAreaSqm: record.totalFloorAreaSqm,
        dongNames: [],
        basisRecords: [record],
      });
    }

    return [...groups.values()];
  }

  match(
    internal: BuildingForRegistry,
    records: BuildingHubBasisRecord[],
  ): LedgerMatchResult {
    const candidates = this.group(records)
      .map((group) => this.score(internal, group))
      .sort((left, right) => right.score - left.score);

    if (candidates.length === 0) {
      return { status: 'NOT_FOUND', selected: null, candidates: [] };
    }

    const top = candidates[0];
    const second = candidates[1];
    const gap = second ? top.score - second.score : top.score;
    const isConfident =
      candidates.length === 1 ||
      (top.score >= BuildingLedgerMatchService.AUTO_MATCH_MIN_SCORE &&
        gap >= BuildingLedgerMatchService.AUTO_MATCH_MIN_GAP);

    return {
      status: isConfident ? 'MATCHED' : 'AMBIGUOUS',
      selected: isConfident ? top : null,
      candidates,
    };
  }

  private score(
    internal: BuildingForRegistry,
    group: LedgerBuildingGroup,
  ): LedgerMatchCandidate {
    let score = 0;
    const reasons: string[] = [];
    const internalAddress = this.normalize(internal.jibunAddress);
    const registryAddress = this.normalize(group.address);
    if (internalAddress && internalAddress === registryAddress) {
      score += 40;
      reasons.push('정규화한 지번주소가 일치합니다.');
    }

    const internalName = this.normalize(internal.buildingName);
    const registryName = this.normalize(group.buildingName);
    if (internalName && registryName && internalName === registryName) {
      score += 25;
      reasons.push('건물명이 일치합니다.');
    } else if (
      internalName &&
      registryName &&
      (internalName.includes(registryName) ||
        registryName.includes(internalName))
    ) {
      score += 12;
      reasons.push('건물명이 부분적으로 일치합니다.');
    }

    if (this.isCompatibleUse(internal.mainUseName, group.mainUseName)) {
      score += 15;
      reasons.push('주용도가 일치하거나 호환됩니다.');
    }

    if (
      internal.groundFloorCount !== null &&
      group.aboveGroundFloorCount !== null &&
      Math.abs(internal.groundFloorCount - group.aboveGroundFloorCount) <= 1
    ) {
      score += 10;
      reasons.push('지상 층수가 유사합니다.');
    }

    if (
      internal.totalFloorAreaSqm !== null &&
      group.totalFloorAreaSqm !== null &&
      internal.totalFloorAreaSqm > 0
    ) {
      const difference =
        Math.abs(internal.totalFloorAreaSqm - group.totalFloorAreaSqm) /
        internal.totalFloorAreaSqm;
      if (difference <= 0.1) {
        score += 10;
        reasons.push('연면적이 10% 이내로 유사합니다.');
      } else if (difference <= 0.25) {
        score += 5;
        reasons.push('연면적이 25% 이내로 유사합니다.');
      }
    }

    return { group, score, reasons };
  }

  private isCompatibleUse(
    internalUse: string | null,
    registryUse: string | null,
  ): boolean {
    const left = this.normalize(internalUse);
    const right = this.normalize(registryUse);
    return Boolean(
      left &&
      right &&
      (left === right || left.includes(right) || right.includes(left)),
    );
  }

  private normalize(value: string | null): string {
    return (value ?? '').replace(/[\s()\-_.]/g, '').toLowerCase();
  }
}
