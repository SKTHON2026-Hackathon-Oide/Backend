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

@Entity({ name: 'business_location_recommendation_result' })
@Unique(['requestId', 'rank'])
@Unique(['requestId', 'commercialAreaId'])
@Index('business_location_recommendation_result_request_idx', [
  'requestId',
  'rank',
])
export class BusinessLocationRecommendationResult {
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

  @Column({ type: 'bigint', name: 'commercial_area_id' })
  commercialAreaId: string;

  @Column({ type: 'bigint', name: 'administrative_area_id', nullable: true })
  administrativeAreaId: string | null;

  @Column({ type: 'varchar', length: 30, name: 'commercial_area_code' })
  commercialAreaCode: string;

  @Column({ type: 'varchar', length: 150, name: 'commercial_area_name' })
  commercialAreaName: string;

  @Column({ type: 'smallint' })
  rank: number;

  @Column({ type: 'numeric', precision: 6, scale: 2, name: 'total_score' })
  totalScore: string;

  @Column({ type: 'jsonb', name: 'score_breakdown' })
  scoreBreakdown: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'operating_hour_fit' })
  operatingHourFit: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  reasons: string[];

  @Column({ type: 'jsonb' })
  risks: string[];

  @Column({ type: 'jsonb', name: 'evidence_ids' })
  evidenceIds: string[];

  @Column({ type: 'timestamp', name: 'created_at', default: () => 'now()' })
  createdAt: Date;
}
