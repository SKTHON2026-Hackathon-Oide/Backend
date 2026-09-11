import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'recommendation_evidence_snapshot' })
@Index('recommendation_evidence_request_idx', ['requestId', 'createdAt'])
export class RecommendationEvidenceSnapshot {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'BY DEFAULT',
  })
  id: string;

  @Column({ type: 'bigint', name: 'request_id' })
  requestId: string;

  @Column({ type: 'varchar', length: 80, name: 'evidence_id', unique: true })
  evidenceId: string;

  @Column({ type: 'varchar', length: 80, name: 'tool_name' })
  toolName: string;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'source_table',
    nullable: true,
  })
  sourceTable: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'source_period',
    nullable: true,
  })
  sourcePeriod: string | null;

  @Column({ type: 'varchar', length: 20 })
  quality: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({
    type: 'varchar',
    length: 128,
    name: 'payload_hash',
    nullable: true,
  })
  payloadHash: string | null;

  @Column({ type: 'integer', name: 'duration_ms', nullable: true })
  durationMs: number | null;

  @Column({ type: 'timestamp', name: 'created_at', default: () => 'now()' })
  createdAt: Date;
}
