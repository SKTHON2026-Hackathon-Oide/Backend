import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'gis_dataset_import' })
export class GisDatasetImport {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'BY DEFAULT',
  })
  id: string;

  @Column({ type: 'varchar', length: 50, name: 'dataset_code' })
  datasetCode: string;

  @Column({ type: 'varchar', length: 255, name: 'source_file_name' })
  sourceFileName: string;

  @Column({ type: 'date', name: 'source_published_at', nullable: true })
  sourcePublishedAt: string | null;

  @Column({ type: 'timestamp', name: 'imported_at', default: () => 'now()' })
  importedAt: Date;

  @Column({
    type: 'varchar',
    length: 30,
    name: 'source_crs',
    default: 'EPSG:5186',
  })
  sourceCrs: string;

  @Column({ type: 'integer', name: 'record_count', nullable: true })
  recordCount: number | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  checksum: string | null;

  @Column({ type: 'timestamp', name: 'created_at', default: () => 'now()' })
  createdAt: Date;

  @Column({ type: 'timestamp', name: 'updated_at', default: () => 'now()' })
  updatedAt: Date;
}
