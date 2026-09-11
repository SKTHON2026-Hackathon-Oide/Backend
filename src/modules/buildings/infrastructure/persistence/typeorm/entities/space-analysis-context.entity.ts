import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Users } from '../../../../../auth/infrastructure/persistence/typeorm/entities/users.entity';
import { Building } from './building.entity';
import { SpaceAnalysisContextStatus } from '../../../../domain/enums/space-analysis-context-status.enum';
import { SpaceAnalysisMode } from '../../../../domain/enums/space-analysis-mode.enum';

@Entity({ name: 'space_analysis_context' })
@Index('space_analysis_context_user_created_idx', ['userId', 'createdAt'])
@Index('space_analysis_context_expires_idx', ['expiresAt'])
@Index('space_analysis_context_selected_building_idx', ['selectedBuildingId'])
export class SpaceAnalysisContext {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Users, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: Users;

  @Column({ type: 'bigint', name: 'user_id' })
  userId: string;

  @Column({ type: 'numeric', precision: 10, scale: 7 })
  longitude: string;

  @Column({ type: 'numeric', precision: 10, scale: 7 })
  latitude: string;

  @Column({ type: 'jsonb', name: 'candidate_building_ids' })
  candidateBuildingIds: string[];

  @ManyToOne(() => Building, { nullable: true })
  @JoinColumn({ name: 'selected_building_id' })
  selectedBuilding: Building | null;

  @Column({ type: 'bigint', name: 'selected_building_id', nullable: true })
  selectedBuildingId: string | null;

  @Column({
    type: 'bigint',
    name: 'selected_registry_cache_id',
    nullable: true,
  })
  selectedRegistryCacheId: string | null;

  @Column({ type: 'jsonb', name: 'selected_space_detail', nullable: true })
  selectedSpaceDetail: Record<string, unknown> | null;

  @Column({
    type: 'varchar',
    length: 30,
    name: 'analysis_mode',
    nullable: true,
  })
  analysisMode: SpaceAnalysisMode | null;

  @Column({ type: 'varchar', length: 40 })
  status: SpaceAnalysisContextStatus;

  @Column({ type: 'timestamp', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'timestamp', name: 'created_at', default: () => 'now()' })
  createdAt: Date;

  @Column({ type: 'timestamp', name: 'updated_at', default: () => 'now()' })
  updatedAt: Date;
}
