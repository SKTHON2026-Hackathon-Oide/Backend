import { BuildingRegistryResult } from '../../applications/results/building-registry.result';

export interface BuildingRegistryLoader {
  execute(buildingId: string): Promise<BuildingRegistryResult>;
}

export const BUILDING_REGISTRY_LOADER = Symbol('BUILDING_REGISTRY_LOADER');
