import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { MultiPolygon } from 'typeorm';
import { AdministrativeArea } from '../../../../../administrative-areas/infrastructure/persistence/typeorm/entities/administrative-area.entity';

@Entity({ name: 'building' })
export class Building {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'BY DEFAULT',
  })
  id: string;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'source_building_id',
    unique: true,
  })
  sourceBuildingId: string;

  @Index('building_pnu_idx')
  @Column({ type: 'varchar', length: 30, nullable: true })
  pnu: string | null;

  @Index('building_legal_dong_code_idx')
  @Column({ type: 'varchar', length: 20, name: 'legal_dong_code', nullable: true })
  legalDongCode: string | null;

  @ManyToOne(() => AdministrativeArea, { nullable: true })
  @JoinColumn({ name: 'legal_dong_id' })
  legalDong: AdministrativeArea | null;

  @Column({ type: 'bigint', name: 'legal_dong_id', nullable: true })
  legalDongId: string | null;

  @Column({ type: 'varchar', length: 300, name: 'road_address', nullable: true })
  roadAddress: string | null;

  @Column({ type: 'varchar', length: 300, name: 'jibun_address', nullable: true })
  jibunAddress: string | null;

  @Column({ type: 'varchar', length: 200, name: 'building_name', nullable: true })
  buildingName: string | null;

  @Column({ type: 'varchar', length: 30, name: 'main_use_code', nullable: true })
  mainUseCode: string | null;

  @Column({ type: 'varchar', length: 100, name: 'main_use_name', nullable: true })
  mainUseName: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'land_area', nullable: true })
  landArea: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'building_area', nullable: true })
  buildingArea: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'total_floor_area', nullable: true })
  totalFloorArea: string | null;

  @Column({ type: 'numeric', precision: 6, scale: 2, name: 'building_coverage_ratio', nullable: true })
  buildingCoverageRatio: string | null;

  @Column({ type: 'numeric', precision: 6, scale: 2, name: 'floor_area_ratio', nullable: true })
  floorAreaRatio: string | null;

  @Column({ type: 'integer', name: 'ground_floor_count', nullable: true })
  groundFloorCount: number | null;

  @Column({ type: 'integer', name: 'underground_floor_count', nullable: true })
  undergroundFloorCount: number | null;

  @Column({ type: 'date', name: 'approval_date', nullable: true })
  approvalDate: string | null;

  @Index('building_geom_gix', { spatial: true })
  @Column('geometry', {
    spatialFeatureType: 'MultiPolygon',
    srid: 5186,
  })
  geom: MultiPolygon;

  @Column({ type: 'timestamp', name: 'created_at', default: () => 'now()' })
  createdAt: Date;

  @Column({ type: 'timestamp', name: 'updated_at', default: () => 'now()' })
  updatedAt: Date;
}
