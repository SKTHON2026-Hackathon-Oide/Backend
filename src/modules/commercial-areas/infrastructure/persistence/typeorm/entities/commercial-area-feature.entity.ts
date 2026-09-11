import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { CommercialArea } from './commercial-area.entity';

@Entity({ name: 'commercial_area_feature' })
@Unique(['commercialAreaId'])
export class CommercialAreaFeature {
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

  @Column({ type: 'date', name: 'base_period' })
  basePeriod: string;

  @Column({
    type: 'integer',
    name: 'total_floating_population',
    nullable: true,
  })
  totalFloatingPopulation: number | null;

  @Column({
    type: 'numeric',
    precision: 6,
    scale: 4,
    name: 'age_20_ratio',
    nullable: true,
  })
  age20Ratio: string | null;

  @Column({
    type: 'numeric',
    precision: 6,
    scale: 4,
    name: 'age_30_ratio',
    nullable: true,
  })
  age30Ratio: string | null;

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
    precision: 5,
    scale: 2,
    name: 'vacancy_rate',
    nullable: true,
  })
  vacancyRate: string | null;

  @Column({ type: 'integer', name: 'residential_population', nullable: true })
  residentialPopulation: number | null;

  @Column({ type: 'integer', name: 'worker_population', nullable: true })
  workerPopulation: number | null;

  @Column({ type: 'timestamp', name: 'updated_at', default: () => 'now()' })
  updatedAt: Date;
}
