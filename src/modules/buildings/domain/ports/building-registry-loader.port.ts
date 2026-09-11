import { BuildingRegistryResult } from '../../applications/results/building-registry.result';

export interface BuildingRegistryLoader {
  execute(
    buildingId: string,
    pagination?: { page?: number; pageSize?: number },
  ): Promise<BuildingRegistryResult>;
}

export const BUILDING_REGISTRY_LOADER = Symbol('BUILDING_REGISTRY_LOADER');
