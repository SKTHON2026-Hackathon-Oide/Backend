import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Building } from '../../../../../buildings/infrastructure/persistence/typeorm/entities/building.entity';
import { Users } from '../../../../../auth/infrastructure/persistence/typeorm/entities/users.entity';

@Entity({ name: 'recommendation_request' })
@Index('recommendation_request_user_idempotency_idx', [
  'userId',
  'idempotencyKey',
])
export class RecommendationRequest {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'BY DEFAULT',
  })
  id: string;

  @ManyToOne(() => Users, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: Users;

  @Column({ type: 'bigint', name: 'user_id' })
  userId: string;

  @ManyToOne(() => Building, { nullable: true })
  @JoinColumn({ name: 'building_id' })
  building: Building | null;

  @Column({ type: 'bigint', name: 'building_id', nullable: true })
  buildingId: string | null;

  @Column({ type: 'text', name: 'natural_language_query', nullable: true })
  naturalLanguageQuery: string | null;

  @Column({ type: 'jsonb', name: 'parsed_condition', nullable: true })
  parsedCondition: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  weights: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 30, default: 'QUEUED' })
  status: string;

  @Column({ type: 'smallint', default: 0 })
  progress: number;

  @Column({
    type: 'varchar',
    length: 40,
    name: 'current_stage',
    default: 'QUEUED',
  })
  currentStage: string;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'idempotency_key',
    nullable: true,
  })
  idempotencyKey: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'prompt_version',
    default: 'location-business-agent-v2',
  })
  promptVersion: string;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'methodology_version',
    default: 'location-business-score-v1',
  })
  methodologyVersion: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  model: string | null;

  @Column({ type: 'jsonb', name: 'data_as_of', nullable: true })
  dataAsOf: Record<string, unknown> | null;

  @Column({ type: 'jsonb', name: 'missing_data', nullable: true })
  missingData: unknown[] | null;

  @Column({ type: 'jsonb', nullable: true })
  result: Record<string, unknown> | null;

  @Column({ type: 'timestamp', name: 'started_at', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamp', name: 'completed_at', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamp', name: 'failed_at', nullable: true })
  failedAt: Date | null;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'failure_code',
    nullable: true,
  })
  failureCode: string | null;

  @Column({ type: 'text', name: 'failure_message', nullable: true })
  failureMessage: string | null;

  @Column({ type: 'varchar', length: 100, name: 'lease_owner', nullable: true })
  leaseOwner: string | null;

  @Column({ type: 'timestamp', name: 'lease_expires_at', nullable: true })
  leaseExpiresAt: Date | null;

  @Column({ type: 'smallint', name: 'attempt_count', default: 0 })
  attemptCount: number;

  @Column({ type: 'timestamp', name: 'created_at', default: () => 'now()' })
  createdAt: Date;

  @Column({ type: 'timestamp', name: 'updated_at', default: () => 'now()' })
  updatedAt: Date;
}
