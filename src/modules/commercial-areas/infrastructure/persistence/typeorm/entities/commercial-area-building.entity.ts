import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { GisBuilding } from '../../../../../buildings/infrastructure/persistence/typeorm/entities/gis-building.entity';
import { CommercialArea } from './commercial-area.entity';

@Entity({ name: 'commercial_area_building' })
export class CommercialAreaBuilding {
  @PrimaryColumn({ type: 'bigint', name: 'commercial_area_id' })
  commercialAreaId: string;

  @ManyToOne(() => CommercialArea, { nullable: false })
  @JoinColumn({ name: 'commercial_area_id' })
  commercialArea: CommercialArea;

  @PrimaryColumn({ type: 'bigint', name: 'gis_building_id' })
  gisBuildingId: string;

  @ManyToOne(() => GisBuilding, { nullable: false })
  @JoinColumn({ name: 'gis_building_id' })
  gisBuilding: GisBuilding;

  @Column({ type: 'numeric', precision: 6, scale: 5, name: 'overlap_ratio', nullable: true })
  overlapRatio: string | null;

  @Column({ type: 'timestamp', name: 'calculated_at', default: () => 'now()' })
  calculatedAt: Date;
}
