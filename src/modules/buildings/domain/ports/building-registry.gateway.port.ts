export interface BuildingHubQuery {
  sigunguCd: string;
  bjdongCd: string;
  platGbCd: string;
  bun: string;
  ji: string;
}

export interface BuildingHubBasisRecord {
  mgmBldrgstPk: string | null;
  buildingName: string | null;
  address: string | null;
  mainUseCode: string | null;
  mainUseName: string | null;
  aboveGroundFloorCount: number | null;
  belowGroundFloorCount: number | null;
  totalFloorAreaSqm: number | null;
  sourceCreatedAt: string | null;
}

export interface BuildingHubFloorRecord {
  mgmBldrgstPk: string | null;
  dongName: string | null;
  floor: number | null;
  floorName: string | null;
  floorAreaSqm: number | null;
  mainUseCode: string | null;
  mainUseName: string | null;
}

export type BuildingHubAreaKind = 'EXCLUSIVE' | 'COMMON' | 'UNKNOWN';

export interface BuildingHubAreaRecord {
  mgmBldrgstPk: string | null;
  dongName: string | null;
  floor: number | null;
  floorName: string | null;
  unitName: string | null;
  areaSqm: number | null;
  areaKind: BuildingHubAreaKind;
  registeredUseCode: string | null;
  registeredUseName: string | null;
}

export interface BuildingHubHousingPriceRecord {
  mgmBldrgstPk: string | null;
  housingPrice: number | null;
  sourceCreatedAt: string | null;
}

export interface BuildingRegistryRawData {
  basis: BuildingHubBasisRecord[];
  floors: BuildingHubFloorRecord[];
  areas: BuildingHubAreaRecord[];
  housingPrices: BuildingHubHousingPriceRecord[];
  rawResponse: {
    basis: unknown;
    floors: unknown;
    areas: unknown;
    housingPrices: unknown;
  };
}

export interface BuildingRegistryGateway {
  fetchByParcel(query: BuildingHubQuery): Promise<BuildingRegistryRawData>;
}

export const BUILDING_REGISTRY_GATEWAY = Symbol('BUILDING_REGISTRY_GATEWAY');
