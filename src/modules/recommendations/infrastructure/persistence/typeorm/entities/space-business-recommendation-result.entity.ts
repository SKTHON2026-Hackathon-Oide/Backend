import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { RecommendationRequest } from './recommendation-request.entity';

@Entity({ name: 'space_business_recommendation_result' })
@Unique(['requestId', 'rank'])
@Unique(['requestId', 'businessCategoryCode'])
@Index('space_business_recommendation_result_request_idx', [
  'requestId',
  'rank',
])
export class SpaceBusinessRecommendationResult {
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

  @Column({ type: 'varchar', length: 30, name: 'business_category_code' })
  businessCategoryCode: string;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'business_category_name',
    nullable: true,
  })
  businessCategoryName: string | null;

  @Column({ type: 'smallint' })
  rank: number;

  @Column({
    type: 'numeric',
    precision: 6,
    scale: 2,
    name: 'total_score',
    nullable: true,
  })
  totalScore: string | null;

  @Column({ type: 'jsonb', name: 'score_breakdown' })
  scoreBreakdown: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'recommended_operating_hours' })
  recommendedOperatingHours: string[];

  @Column({ type: 'jsonb' })
  reasons: string[];

  @Column({ type: 'jsonb' })
  risks: string[];

  @Column({ type: 'jsonb', name: 'evidence_ids' })
  evidenceIds: string[];

  @Column({ type: 'timestamp', name: 'created_at', default: () => 'now()' })
  createdAt: Date;
}
