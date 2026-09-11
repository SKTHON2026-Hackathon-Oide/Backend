export type BuildingMatchType = 'INTERSECTS' | 'NEARBY';

export interface BuildingCandidate {
  buildingId: string;
  matchType: BuildingMatchType;
  distanceMeters: number;
  buildingName: string | null;
  jibunAddress: string | null;
  mainUseName: string | null;
  buildingAreaSqm: number | null;
  totalFloorAreaSqm: number | null;
  groundFloorCount: number | null;
  geometry: {
    type: 'MultiPolygon';
    coordinates: unknown;
  };
}

export interface BuildingSearchPoint {
  longitude: number;
  latitude: number;
}

export interface BuildingSearchPort {
  isInSeoul(point: BuildingSearchPoint): Promise<boolean>;
  findCandidates(
    point: BuildingSearchPoint,
    limit: number,
  ): Promise<BuildingCandidate[]>;
}

export const BUILDING_SEARCH_PORT = Symbol('BUILDING_SEARCH_PORT');
