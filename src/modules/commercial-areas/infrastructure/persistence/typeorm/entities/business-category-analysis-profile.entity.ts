import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { BusinessCategory } from './business-category.entity';

export type AnalysisProfileSource = 'AI_HEURISTIC' | 'CURATED' | 'EMPIRICAL';

export type AnalysisProfileConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

@Entity({ name: 'business_category_analysis_profile' })
@Unique(['businessCategoryCode', 'profileVersion'])
export class BusinessCategoryAnalysisProfile {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'BY DEFAULT',
  })
  id: string;

  @ManyToOne(() => BusinessCategory, { nullable: false })
  @JoinColumn({ name: 'business_category_code' })
  businessCategory: BusinessCategory;

  @Column({
    type: 'varchar',
    length: 30,
    name: 'business_category_code',
  })
  businessCategoryCode: string;

  @Column({ type: 'varchar', length: 30, name: 'profile_version' })
  profileVersion: string;

  @Column({ type: 'varchar', length: 30, name: 'profile_source' })
  profileSource: AnalysisProfileSource;

  @Column({ type: 'varchar', length: 10, name: 'confidence_level' })
  confidenceLevel: AnalysisProfileConfidence;

  @Column({ type: 'varchar', array: true, name: 'target_age_groups' })
  targetAgeGroups: string[];

  @Column({ type: 'varchar', array: true, name: 'peak_time_ranges' })
  peakTimeRanges: string[];

  @Column({ type: 'varchar', array: true, name: 'peak_day_types' })
  peakDayTypes: string[];

  @Column({ type: 'varchar', array: true, name: 'preferred_floors' })
  preferredFloors: string[];

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    name: 'recommended_area_min_sqm',
    nullable: true,
  })
  recommendedAreaMinSqm: string | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    name: 'recommended_area_max_sqm',
    nullable: true,
  })
  recommendedAreaMaxSqm: string | null;

  @Column({ type: 'smallint', name: 'floating_population_importance' })
  floatingPopulationImportance: number;

  @Column({ type: 'smallint', name: 'resident_population_importance' })
  residentPopulationImportance: number;

  @Column({ type: 'smallint', name: 'worker_population_importance' })
  workerPopulationImportance: number;

  @Column({ type: 'smallint', name: 'transit_access_importance' })
  transitAccessImportance: number;

  @Column({ type: 'smallint', name: 'street_visibility_importance' })
  streetVisibilityImportance: number;

  @Column({ type: 'smallint', name: 'parking_importance' })
  parkingImportance: number;

  @Column({ type: 'smallint', name: 'delivery_compatibility' })
  deliveryCompatibility: number;

  @Column({ type: 'smallint', name: 'competition_tolerance' })
  competitionTolerance: number;

  @Column({ type: 'smallint', name: 'rent_sensitivity' })
  rentSensitivity: number;

  @Column({ type: 'smallint', name: 'weekend_dependence' })
  weekendDependence: number;

  @Column({ type: 'smallint', name: 'evening_dependence' })
  eveningDependence: number;

  @Column({ type: 'text' })
  rationale: string;

  @Column({ type: 'text' })
  caveat: string;

  @Column({ type: 'boolean', name: 'is_active', default: false })
  isActive: boolean;

  @Column({ type: 'timestamp', name: 'created_at', default: () => 'now()' })
  createdAt: Date;

  @Column({ type: 'timestamp', name: 'updated_at', default: () => 'now()' })
  updatedAt: Date;
}
