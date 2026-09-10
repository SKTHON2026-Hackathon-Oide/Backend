import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Building } from '../../../../../buildings/infrastructure/persistence/typeorm/entities/building.entity';
import { RecommendationRequest } from './recommendation-request.entity';

@Entity({ name: 'recommendation_result' })
@Unique(['requestId', 'rank'])
@Unique(['requestId', 'buildingId'])
export class RecommendationResult {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'BY DEFAULT',
  })
  id: string;

  @ManyToOne(() => RecommendationRequest, { nullable: false })
  @JoinColumn({ name: 'request_id' })
  request: RecommendationRequest;

  @Column({ type: 'bigint', name: 'request_id' })
  requestId: string;

  @ManyToOne(() => Building, { nullable: false })
  @JoinColumn({ name: 'building_id' })
  building: Building;

  @Column({ type: 'bigint', name: 'building_id' })
  buildingId: string;

  @Column({ type: 'integer' })
  rank: number;

  @Column({ type: 'numeric', precision: 10, scale: 4, name: 'total_score' })
  totalScore: string;

  @Column({ type: 'jsonb', name: 'score_breakdown' })
  scoreBreakdown: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  explanation: string | null;

  @Column({ type: 'timestamp', name: 'created_at', default: () => 'now()' })
  createdAt: Date;
}
