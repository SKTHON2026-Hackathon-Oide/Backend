import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { Polygon } from 'typeorm';

@Entity({ name: 'floating_population_grid' })
export class FloatingPopulationGrid {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'BY DEFAULT',
  })
  id: string;

  @Column({ type: 'varchar', length: 50, name: 'grid_code', unique: true })
  gridCode: string;

  @Index('floating_population_grid_geom_gix', { spatial: true })
  @Column('geometry', { spatialFeatureType: 'Polygon', srid: 5186 })
  geom: Polygon;

  @Column({ type: 'timestamp', name: 'created_at', default: () => 'now()' })
  createdAt: Date;

  @Column({ type: 'timestamp', name: 'updated_at', default: () => 'now()' })
  updatedAt: Date;
}
