import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'business_category' })
export class BusinessCategory {
  @PrimaryColumn({ type: 'varchar', length: 30 })
  code: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  name: string | null;

  @Column({
    type: 'varchar',
    length: 30,
    name: 'category_group',
    nullable: true,
  })
  categoryGroup: string | null;

  @Column({ type: 'boolean', name: 'is_sales_supported', default: false })
  isSalesSupported: boolean;

  @Column({ type: 'timestamp', name: 'created_at', default: () => 'now()' })
  createdAt: Date;

  @Column({ type: 'timestamp', name: 'updated_at', default: () => 'now()' })
  updatedAt: Date;
}
