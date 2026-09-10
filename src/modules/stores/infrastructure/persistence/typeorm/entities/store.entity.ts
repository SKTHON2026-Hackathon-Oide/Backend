import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { Point } from 'typeorm';

@Entity({ name: 'store' })
@Index('store_category_status_idx', ['businessCategoryCode', 'status'])
export class Store {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'BY DEFAULT',
  })
  id: string;

  @Column({ type: 'varchar', length: 100, name: 'source_store_id', unique: true })
  sourceStoreId: string;

  @Column({ type: 'varchar', length: 30, name: 'business_category_code' })
  businessCategoryCode: string;

  @Column({ type: 'varchar', length: 100, name: 'business_category_name' })
  businessCategoryName: string;

  @Column({ type: 'varchar', length: 30, name: 'business_subcategory_code', nullable: true })
  businessSubcategoryCode: string | null;

  @Column({ type: 'varchar', length: 100, name: 'business_subcategory_name', nullable: true })
  businessSubcategoryName: string | null;

  @Column({ type: 'varchar', length: 200, name: 'store_name', nullable: true })
  storeName: string | null;

  @Column({ type: 'varchar', length: 300, name: 'road_address', nullable: true })
  roadAddress: string | null;

  @Column({ type: 'varchar', length: 20, name: 'legal_dong_code', nullable: true })
  legalDongCode: string | null;

  @Index('store_geom_gix', { spatial: true })
  @Column('geometry', { spatialFeatureType: 'Point', srid: 5186 })
  geom: Point;

  @Column({ type: 'date', name: 'opened_at', nullable: true })
  openedAt: string | null;

  @Column({ type: 'date', name: 'closed_at', nullable: true })
  closedAt: string | null;

  @Column({ type: 'varchar', length: 20 })
  status: string;

  @Column({ type: 'timestamp', name: 'created_at', default: () => 'now()' })
  createdAt: Date;

  @Column({ type: 'timestamp', name: 'updated_at', default: () => 'now()' })
  updatedAt: Date;
}
