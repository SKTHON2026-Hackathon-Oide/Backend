import { createHash } from 'node:crypto';
import {
  BuildingHubAreaRecord,
  BuildingHubFloorRecord,
} from '../ports/building-registry.gateway.port';

export interface RegistrySpaceOption {
  optionId: string;
  registryKey: string | null;
  registryGroupKey: string | null;
  dongName: string | null;
  floor: number | null;
  floorName: string | null;
  unitName: string | null;
  exclusiveAreaSqm: number | null;
  commonAreaSqm: number | null;
  floorAreaSqm: number | null;
  registeredUseCode: string | null;
  registeredUseName: string | null;
  areaSource: 'BUILDING_HUB_EXCLUSIVE_AREA' | 'BUILDING_HUB_FLOOR_AREA';
}

export class RegistrySpaceOptionService {
  create(
    areaRecords: BuildingHubAreaRecord[],
    floorRecords: BuildingHubFloorRecord[],
  ): RegistrySpaceOption[] {
    const unitOptions = this.createUnitOptions(areaRecords);
    if (unitOptions.length > 0) return unitOptions;

    return this.createFloorOptions(floorRecords);
  }

  private createUnitOptions(
    records: BuildingHubAreaRecord[],
  ): RegistrySpaceOption[] {
    const groups = new Map<string, RegistrySpaceOption>();
    for (const record of records) {
      if (record.areaKind === 'UNKNOWN' || record.areaSqm === null) continue;
      const key = [
        record.mgmBldrgstPk ?? '',
        record.dongName ?? '',
        record.floor ?? '',
        record.floorName ?? '',
        record.unitName ?? '',
        record.registeredUseCode ?? '',
        record.registeredUseName ?? '',
      ].join('|');
      const current = groups.get(key);
      if (current) {
        if (record.areaKind === 'EXCLUSIVE') {
          current.exclusiveAreaSqm = this.add(
            current.exclusiveAreaSqm,
            record.areaSqm,
          );
        } else {
          current.commonAreaSqm = this.add(
            current.commonAreaSqm,
            record.areaSqm,
          );
        }
        continue;
      }

      groups.set(key, {
        optionId: this.optionId(key),
        registryKey: record.mgmBldrgstPk,
        registryGroupKey: null,
        dongName: record.dongName,
        floor: record.floor,
        floorName: record.floorName,
        unitName: record.unitName,
        exclusiveAreaSqm:
          record.areaKind === 'EXCLUSIVE' ? record.areaSqm : null,
        commonAreaSqm: record.areaKind === 'COMMON' ? record.areaSqm : null,
        floorAreaSqm: null,
        registeredUseCode: record.registeredUseCode,
        registeredUseName: record.registeredUseName,
        areaSource: 'BUILDING_HUB_EXCLUSIVE_AREA',
      });
    }
    return [...groups.values()];
  }

  private createFloorOptions(
    records: BuildingHubFloorRecord[],
  ): RegistrySpaceOption[] {
    const options = new Map<string, RegistrySpaceOption>();
    for (const record of records) {
      if (record.floorAreaSqm === null) continue;
      const key = [
        record.mgmBldrgstPk ?? '',
        record.dongName ?? '',
        record.floor ?? '',
        record.floorName ?? '',
      ].join('|');
      if (options.has(key)) continue;
      options.set(key, {
        optionId: this.optionId(key),
        registryKey: record.mgmBldrgstPk,
        registryGroupKey: null,
        dongName: record.dongName,
        floor: record.floor,
        floorName: record.floorName,
        unitName: null,
        exclusiveAreaSqm: null,
        commonAreaSqm: null,
        floorAreaSqm: record.floorAreaSqm,
        registeredUseCode: record.mainUseCode,
        registeredUseName: record.mainUseName,
        areaSource: 'BUILDING_HUB_FLOOR_AREA',
      });
    }
    return [...options.values()];
  }

  private add(left: number | null, right: number): number {
    return Number(((left ?? 0) + right).toFixed(2));
  }

  private optionId(fingerprint: string): string {
    return `opt_${createHash('sha256').update(fingerprint).digest('hex').slice(0, 32)}`;
  }
}
