import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Building } from './building.entity';

@Entity({ name: 'building_registry_cache' })
@Index('building_registry_cache_building_expires_idx', [
  'buildingId',
  'expiresAt',
])
export class BuildingRegistryCache {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'BY DEFAULT',
  })
  id: string;

  @ManyToOne(() => Building, { nullable: false })
  @JoinColumn({ name: 'building_id' })
  building: Building;

  @Column({ type: 'bigint', name: 'building_id' })
  buildingId: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  pnu: string | null;

  @Column({ type: 'varchar', length: 128, name: 'request_fingerprint' })
  requestFingerprint: string;

  @Column({ type: 'varchar', length: 40 })
  status: string;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'matched_mgm_bldrgst_pk',
    nullable: true,
  })
  matchedMgmBldrgstPk: string | null;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 4,
    name: 'match_confidence',
    nullable: true,
  })
  matchConfidence: string | null;

  @Column({ type: 'jsonb', name: 'normalized_options', nullable: true })
  normalizedOptions: Record<string, unknown> | null;

  @Column({ type: 'jsonb', name: 'raw_response', nullable: true })
  rawResponse: Record<string, unknown> | null;

  @Column({ type: 'date', name: 'source_created_at', nullable: true })
  sourceCreatedAt: string | null;

  @Column({ type: 'timestamp', name: 'fetched_at' })
  fetchedAt: Date;

  @Column({ type: 'timestamp', name: 'expires_at' })
  expiresAt: Date;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'last_error_code',
    nullable: true,
  })
  lastErrorCode: string | null;

  @Column({ type: 'timestamp', name: 'created_at', default: () => 'now()' })
  createdAt: Date;

  @Column({ type: 'timestamp', name: 'updated_at', default: () => 'now()' })
  updatedAt: Date;
}
