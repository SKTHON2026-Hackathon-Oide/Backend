export interface BuildingForRegistry {
  buildingId: string;
  pnu: string | null;
  buildingName: string | null;
  jibunAddress: string | null;
  mainUseName: string | null;
  groundFloorCount: number | null;
  undergroundFloorCount: number | null;
  totalFloorAreaSqm: number | null;
}

export interface BuildingLookupPort {
  findById(buildingId: string): Promise<BuildingForRegistry | null>;
}

export const BUILDING_LOOKUP_PORT = Symbol('BUILDING_LOOKUP_PORT');
