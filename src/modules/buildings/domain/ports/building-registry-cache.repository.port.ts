import { BuildingRegistryCache } from '../../infrastructure/persistence/typeorm/entities/building-registry-cache.entity';

export interface BuildingRegistryCacheRepository {
  findById(cacheId: string): Promise<BuildingRegistryCache | null>;
  findLatestValid(
    buildingId: string,
    requestFingerprint: string,
    now: Date,
  ): Promise<BuildingRegistryCache | null>;
  findLatest(
    buildingId: string,
    requestFingerprint: string,
  ): Promise<BuildingRegistryCache | null>;
  save(cache: BuildingRegistryCache): Promise<BuildingRegistryCache>;
}

export const BUILDING_REGISTRY_CACHE_REPOSITORY = Symbol(
  'BUILDING_REGISTRY_CACHE_REPOSITORY',
);
