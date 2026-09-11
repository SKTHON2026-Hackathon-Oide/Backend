import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { BuildingRegistryCacheRepository } from '../../../../domain/ports/building-registry-cache.repository.port';
import { BuildingRegistryCache } from '../entities/building-registry-cache.entity';

@Injectable()
export class TypeOrmBuildingRegistryCacheRepository implements BuildingRegistryCacheRepository {
  constructor(
    @InjectRepository(BuildingRegistryCache)
    private readonly repository: Repository<BuildingRegistryCache>,
  ) {}

  findById(cacheId: string): Promise<BuildingRegistryCache | null> {
    return this.repository.findOne({ where: { id: cacheId } });
  }

  findLatestValid(
    buildingId: string,
    requestFingerprint: string,
    now: Date,
  ): Promise<BuildingRegistryCache | null> {
    return this.repository
      .findOne({
        where: {
          buildingId,
          requestFingerprint,
          expiresAt: MoreThan(now),
        },
        order: { fetchedAt: 'DESC' },
      })
      .then((cache) => cache ?? null);
  }

  findLatest(
    buildingId: string,
    requestFingerprint: string,
  ): Promise<BuildingRegistryCache | null> {
    return this.repository.findOne({
      where: { buildingId, requestFingerprint },
      order: { fetchedAt: 'DESC' },
    });
  }

  save(cache: BuildingRegistryCache): Promise<BuildingRegistryCache> {
    return this.repository.save(cache);
  }
}
