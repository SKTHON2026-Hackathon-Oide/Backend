import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'store_category_mapping' })
export class StoreCategoryMapping {
  @PrimaryColumn({
    type: 'varchar',
    length: 30,
    name: 'source_subcategory_code',
  })
  sourceSubcategoryCode: string;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'source_subcategory_name',
    nullable: true,
  })
  sourceSubcategoryName: string | null;

  @Index('store_category_mapping_target_idx')
  @Column({
    type: 'varchar',
    length: 30,
    name: 'business_category_code',
    nullable: true,
  })
  businessCategoryCode: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'mapping_status',
    default: 'REVIEW',
  })
  mappingStatus: string;

  @Column({
    type: 'varchar',
    length: 300,
    name: 'mapping_note',
    nullable: true,
  })
  mappingNote: string | null;

  @Column({ type: 'timestamp', name: 'updated_at', default: () => 'now()' })
  updatedAt: Date;
}
