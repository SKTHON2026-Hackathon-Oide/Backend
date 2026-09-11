import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AdministrativeArea } from '../../../../../administrative-areas/infrastructure/persistence/typeorm/entities/administrative-area.entity';
import { CommercialArea } from '../../../../../commercial-areas/infrastructure/persistence/typeorm/entities/commercial-area.entity';

@Entity({ name: 'rent_statistic' })
@Check(
  'rent_statistic_exactly_one_area',
  '((commercial_area_id IS NOT NULL)::integer + (administrative_area_id IS NOT NULL)::integer = 1)',
)
export class RentStatistic {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'BY DEFAULT',
  })
  id: string;

  @ManyToOne(() => CommercialArea, { nullable: true })
  @JoinColumn({ name: 'commercial_area_id' })
  commercialArea: CommercialArea | null;

  @Column({ type: 'bigint', name: 'commercial_area_id', nullable: true })
  commercialAreaId: string | null;

  @ManyToOne(() => AdministrativeArea, { nullable: true })
  @JoinColumn({ name: 'administrative_area_id' })
  administrativeArea: AdministrativeArea | null;

  @Column({ type: 'bigint', name: 'administrative_area_id', nullable: true })
  administrativeAreaId: string | null;

  @Index('rent_statistic_period_idx')
  @Column({ type: 'date', name: 'base_period' })
  basePeriod: string;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    name: 'avg_rent',
    nullable: true,
  })
  avgRent: string | null;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    name: 'avg_rent_per_sqm',
    nullable: true,
  })
  avgRentPerSqm: string | null;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    name: 'average_deposit',
    nullable: true,
  })
  averageDeposit: string | null;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    name: 'vacancy_rate',
    nullable: true,
  })
  vacancyRate: string | null;

  @Column({ type: 'timestamp', name: 'created_at', default: () => 'now()' })
  createdAt: Date;

  @Column({ type: 'timestamp', name: 'updated_at', default: () => 'now()' })
  updatedAt: Date;
}
