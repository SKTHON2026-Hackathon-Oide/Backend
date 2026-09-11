import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { MultiPolygon } from 'typeorm';

@Entity({ name: 'commercial_area' })
export class CommercialArea {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'BY DEFAULT',
  })
  id: string;

  @Column({
    type: 'varchar',
    length: 30,
    name: 'commercial_area_code',
    unique: true,
  })
  commercialAreaCode: string;

  @Column({ type: 'varchar', length: 150, name: 'commercial_area_name' })
  commercialAreaName: string;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'commercial_area_type',
    nullable: true,
  })
  commercialAreaType: string | null;

  @Index('commercial_area_geom_gix', { spatial: true })
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
