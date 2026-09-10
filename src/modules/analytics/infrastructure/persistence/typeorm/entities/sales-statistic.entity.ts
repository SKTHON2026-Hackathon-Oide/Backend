import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { CommercialArea } from '../../../../../commercial-areas/infrastructure/persistence/typeorm/entities/commercial-area.entity';

@Entity({ name: 'sales_statistic' })
@Unique(['commercialAreaId', 'businessCategoryCode', 'basePeriod'])
export class SalesStatistic {
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

  @Index('sales_statistic_period_idx')
  @Column({ type: 'date', name: 'base_period' })
  basePeriod: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, name: 'estimated_sales_amount', nullable: true })
  estimatedSalesAmount: string | null;

  @Column({ type: 'bigint', name: 'transaction_count', nullable: true })
  transactionCount: string | null;

  @Column({ type: 'numeric', precision: 18, scale: 2, name: 'average_transaction_amount', nullable: true })
  averageTransactionAmount: string | null;

  @Column({ type: 'integer', name: 'store_count', nullable: true })
  storeCount: number | null;

  @Column({ type: 'integer', name: 'closed_store_count', nullable: true })
  closedStoreCount: number | null;

  @Column({ type: 'timestamp', name: 'created_at', default: () => 'now()' })
  createdAt: Date;

  @Column({ type: 'timestamp', name: 'updated_at', default: () => 'now()' })
  updatedAt: Date;
}
