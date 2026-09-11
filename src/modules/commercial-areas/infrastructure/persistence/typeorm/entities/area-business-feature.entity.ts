import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { CommercialArea } from './commercial-area.entity';

@Entity({ name: 'area_business_feature' })
@Unique(['commercialAreaId', 'businessCategoryCode', 'basePeriod'])
export class AreaBusinessFeature {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'BY DEFAULT',
  })
  id: string;

  @ManyToOne(() => CommercialArea, { nullable: false })
  @JoinColumn({ name: 'commercial_area_id' })
  commercialArea: CommercialArea;

  @Column({ type: 'bigint', name: 'commercial_area_id' })
  commercialAreaId: string;

  @Column({ type: 'varchar', length: 30, name: 'business_category_code' })
  businessCategoryCode: string;

  @Column({ type: 'date', name: 'base_period' })
  basePeriod: string;

  @Column({ type: 'integer', name: 'store_count', nullable: true })
  storeCount: number | null;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    name: 'estimated_sales_amount',
    nullable: true,
  })
  estimatedSalesAmount: string | null;

  @Column({
    type: 'numeric',
    precision: 6,
    scale: 4,
    name: 'closure_rate',
    nullable: true,
  })
  closureRate: string | null;

  @Column({
    type: 'numeric',
    precision: 8,
    scale: 4,
    name: 'competition_score',
    nullable: true,
  })
  competitionScore: string | null;

  @Column({
    type: 'numeric',
    precision: 8,
    scale: 4,
    name: 'demand_score',
    nullable: true,
  })
  demandScore: string | null;

  @Column({ type: 'timestamp', name: 'updated_at', default: () => 'now()' })
  updatedAt: Date;
}
