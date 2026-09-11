import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { MultiPolygon, Point } from 'typeorm';
import { Building } from './building.entity';
import { GisDatasetImport } from './gis-dataset-import.entity';

@Entity({ name: 'gis_building' })
@Unique(['importId', 'gisBuildingId'])
@Index('gis_building_current_uidx', ['gisBuildingId'], {
  unique: true,
  where: '"is_current" = true',
})
export class GisBuilding {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'BY DEFAULT',
  })
  id: string;

  @ManyToOne(() => GisDatasetImport, { nullable: false })
  @JoinColumn({ name: 'import_id' })
  importRecord: GisDatasetImport;

  @Column({ type: 'bigint', name: 'import_id' })
  importId: string;

  @ManyToOne(() => Building, { nullable: true })
  @JoinColumn({ name: 'building_id' })
  building: Building | null;

  @Column({ type: 'bigint', name: 'building_id', nullable: true })
  buildingId: string | null;

  @Column({ type: 'varchar', length: 50, name: 'gis_building_id' })
  gisBuildingId: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  ufid: string | null;

  @Index('gis_building_pnu_idx')
  @Column({ type: 'varchar', length: 19, nullable: true })
  pnu: string | null;

  @Index('gis_building_legal_dong_idx')
  @Column({
    type: 'varchar',
    length: 10,
    name: 'legal_dong_code',
    nullable: true,
  })
  legalDongCode: string | null;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'legal_dong_name',
    nullable: true,
  })
  legalDongName: string | null;

  @Column({ type: 'varchar', length: 5, name: 'sigungu_code', nullable: true })
  sigunguCode: string | null;

  @Column({ type: 'varchar', length: 10, name: 'lot_main_no', nullable: true })
  lotMainNo: string | null;

  @Column({ type: 'varchar', length: 10, name: 'lot_sub_no', nullable: true })
  lotSubNo: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'building_category',
    nullable: true,
  })
  buildingCategory: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'building_use_code',
    nullable: true,
  })
  buildingUseCode: string | null;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'building_use_name',
    nullable: true,
  })
  buildingUseName: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'structure_code',
    nullable: true,
  })
  structureCode: string | null;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'structure_name',
    nullable: true,
  })
  structureName: string | null;

  @Column({ type: 'date', name: 'approval_date', nullable: true })
  approvalDate: string | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    name: 'building_height_m',
    nullable: true,
  })
  buildingHeightM: string | null;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    name: 'building_area_sqm',
    nullable: true,
  })
  buildingAreaSqm: string | null;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    name: 'total_floor_area_sqm',
    nullable: true,
  })
  totalFloorAreaSqm: string | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    name: 'roof_height_m',
    nullable: true,
  })
  roofHeightM: string | null;

  @Column({ type: 'integer', name: 'above_ground_floor_count', nullable: true })
  aboveGroundFloorCount: number | null;

  @Column({ type: 'integer', name: 'below_ground_floor_count', nullable: true })
  belowGroundFloorCount: number | null;

  @Index('gis_building_geometry_gix', { spatial: true })
  @Column('geometry', {
    spatialFeatureType: 'MultiPolygon',
    srid: 5186,
  })
  geometry: MultiPolygon;

  @Index('gis_building_centroid_gix', { spatial: true })
  @Column('geometry', {
    spatialFeatureType: 'Point',
    srid: 5186,
    nullable: true,
  })
  centroid: Point | null;

  @Column({ type: 'date', name: 'source_updated_at', nullable: true })
  sourceUpdatedAt: string | null;

  @Column({ type: 'boolean', name: 'is_current', default: true })
  isCurrent: boolean;

  @Column({ type: 'timestamp', name: 'created_at', default: () => 'now()' })
  createdAt: Date;

  @Column({ type: 'timestamp', name: 'updated_at', default: () => 'now()' })
  updatedAt: Date;
}
