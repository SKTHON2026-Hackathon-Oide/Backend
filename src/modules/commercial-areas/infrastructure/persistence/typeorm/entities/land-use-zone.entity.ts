import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { MultiPolygon } from 'typeorm';

@Entity({ name: 'land_use_zone' })
export class LandUseZone {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'BY DEFAULT',
  })
  id: string;

  @Column({ type: 'varchar', length: 30, name: 'zone_code' })
  zoneCode: string;

  @Column({ type: 'varchar', length: 100, name: 'zone_name' })
  zoneName: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category: string | null;

  @Index('land_use_zone_geom_gix', { spatial: true })
  @Column('geometry', {
    spatialFeatureType: 'MultiPolygon',
    srid: 5186,
  })
  geom: MultiPolygon;
}
