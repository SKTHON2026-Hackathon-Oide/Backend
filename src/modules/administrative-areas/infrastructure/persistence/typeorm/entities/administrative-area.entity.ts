import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { MultiPolygon } from 'typeorm';

@Entity({ name: 'administrative_area' })
@Unique('administrative_area_parent_id_code_key', ['parentId', 'code'])
export class AdministrativeArea {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'BY DEFAULT',
  })
  id: string;

  @Column({ type: 'varchar', length: 16, name: 'area_type' })
  areaType: string;

  @Column({ type: 'varchar', length: 20 })
  code: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @ManyToOne(() => AdministrativeArea, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: AdministrativeArea | null;

  @Column({ type: 'bigint', name: 'parent_id', nullable: true })
  parentId: string | null;

  @Index('administrative_area_geom_gix', { spatial: true })
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
