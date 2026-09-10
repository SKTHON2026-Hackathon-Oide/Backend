import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Users } from '../../../../../auth/infrastructure/persistence/typeorm/entities/users.entity';

@Entity({ name: 'recommendation_request' })
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

  @Column({ type: 'text', name: 'natural_language_query' })
  naturalLanguageQuery: string;

  @Column({ type: 'jsonb', name: 'parsed_condition' })
  parsedCondition: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  weights: Record<string, unknown> | null;

  @Column({ type: 'timestamp', name: 'created_at', default: () => 'now()' })
  createdAt: Date;
}
