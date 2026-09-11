import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'recommendation_event' })
@Index('recommendation_event_request_id_idx', ['requestId', 'id'])
export class RecommendationEvent {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'BY DEFAULT',
  })
  id: string;

  @Column({ type: 'bigint', name: 'request_id' })
  requestId: string;

  @Column({ type: 'varchar', length: 40, name: 'event_type' })
  eventType: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'timestamp', name: 'created_at', default: () => 'now()' })
  createdAt: Date;
}
