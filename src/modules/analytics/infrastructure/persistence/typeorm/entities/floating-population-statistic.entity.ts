import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { FloatingPopulationGrid } from './floating-population-grid.entity';

@Entity({ name: 'floating_population_statistic' })
@Unique(['gridId', 'basePeriod', 'timeSlot'])
export class FloatingPopulationStatistic {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'BY DEFAULT',
  })
  id: string;

  @ManyToOne(() => FloatingPopulationGrid, { nullable: false })
  @JoinColumn({ name: 'grid_id' })
  grid: FloatingPopulationGrid;

  @Column({ type: 'bigint', name: 'grid_id' })
  gridId: string;

  @Column({ type: 'date', name: 'base_period' })
  basePeriod: string;

  @Column({ type: 'varchar', length: 20, name: 'time_slot' })
  timeSlot: string;

  @Column({ type: 'integer', name: 'total_population', nullable: true })
  totalPopulation: number | null;

  @Column({ type: 'integer', name: 'male_population', nullable: true })
  malePopulation: number | null;

  @Column({ type: 'integer', name: 'female_population', nullable: true })
  femalePopulation: number | null;

  @Column({ type: 'integer', name: 'age_10s', nullable: true })
  age10s: number | null;

  @Column({ type: 'integer', name: 'age_20s', nullable: true })
  age20s: number | null;

  @Column({ type: 'integer', name: 'age_30s', nullable: true })
  age30s: number | null;

  @Column({ type: 'integer', name: 'age_40s', nullable: true })
  age40s: number | null;

  @Column({ type: 'integer', name: 'age_50s', nullable: true })
  age50s: number | null;

  @Column({ type: 'integer', name: 'age_60_plus', nullable: true })
  age60Plus: number | null;

  @Column({ type: 'integer', name: 'residential_population', nullable: true })
  residentialPopulation: number | null;

  @Column({ type: 'integer', name: 'worker_population', nullable: true })
  workerPopulation: number | null;

  @Column({ type: 'timestamp', name: 'created_at', default: () => 'now()' })
  createdAt: Date;

  @Column({ type: 'timestamp', name: 'updated_at', default: () => 'now()' })
  updatedAt: Date;
}
