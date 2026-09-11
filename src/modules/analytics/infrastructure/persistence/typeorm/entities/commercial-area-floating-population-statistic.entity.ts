import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { CommercialArea } from '../../../../../commercial-areas/infrastructure/persistence/typeorm/entities/commercial-area.entity';

@Entity({ name: 'commercial_area_floating_population_statistic' })
@Unique(['commercialAreaId', 'basePeriod'])
export class CommercialAreaFloatingPopulationStatistic {
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

  @Column({ type: 'varchar', length: 10, name: 'commercial_area_type_code' })
  commercialAreaTypeCode: string;

  @Column({ type: 'varchar', length: 50, name: 'commercial_area_type_name' })
  commercialAreaTypeName: string;

  @Column({ type: 'integer', name: 'total_population' })
  totalPopulation: number;

  @Column({ type: 'integer', name: 'male_population' })
  malePopulation: number;

  @Column({ type: 'integer', name: 'female_population' })
  femalePopulation: number;

  @Column({ type: 'integer', name: 'age_10s' }) age10s: number;
  @Column({ type: 'integer', name: 'age_20s' }) age20s: number;
  @Column({ type: 'integer', name: 'age_30s' }) age30s: number;
  @Column({ type: 'integer', name: 'age_40s' }) age40s: number;
  @Column({ type: 'integer', name: 'age_50s' }) age50s: number;
  @Column({ type: 'integer', name: 'age_60_plus' }) age60Plus: number;
  @Column({ type: 'integer', name: 'time_00_06' }) time0006: number;
  @Column({ type: 'integer', name: 'time_06_11' }) time0611: number;
  @Column({ type: 'integer', name: 'time_11_14' }) time1114: number;
  @Column({ type: 'integer', name: 'time_14_17' }) time1417: number;
  @Column({ type: 'integer', name: 'time_17_21' }) time1721: number;
  @Column({ type: 'integer', name: 'time_21_24' }) time2124: number;
  @Column({ type: 'integer', name: 'monday_population' })
  mondayPopulation: number;
  @Column({ type: 'integer', name: 'tuesday_population' })
  tuesdayPopulation: number;
  @Column({ type: 'integer', name: 'wednesday_population' })
  wednesdayPopulation: number;
  @Column({ type: 'integer', name: 'thursday_population' })
  thursdayPopulation: number;
  @Column({ type: 'integer', name: 'friday_population' })
  fridayPopulation: number;
  @Column({ type: 'integer', name: 'saturday_population' })
  saturdayPopulation: number;
  @Column({ type: 'integer', name: 'sunday_population' })
  sundayPopulation: number;

  @Column({ type: 'timestamp', name: 'fetched_at', default: () => 'now()' })
  fetchedAt: Date;

  @Column({ type: 'timestamp', name: 'created_at', default: () => 'now()' })
  createdAt: Date;

  @Column({ type: 'timestamp', name: 'updated_at', default: () => 'now()' })
  updatedAt: Date;
}
