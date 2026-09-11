import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Keeps Seoul commercial-analysis (CS*) codes as the canonical taxonomy and
 * preserves the source store taxonomy separately for later reconciliation.
 */
export class CreateBusinessCategorySchema2026091000005 implements MigrationInterface {
  name = 'CreateBusinessCategorySchema2026091000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS business_category (
        code VARCHAR(30) PRIMARY KEY,
        name VARCHAR(100),
        category_group VARCHAR(30),
        is_sales_supported BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS store_category_mapping (
        source_subcategory_code VARCHAR(30) PRIMARY KEY,
        source_subcategory_name VARCHAR(100),
        business_category_code VARCHAR(30),
        mapping_status VARCHAR(20) NOT NULL DEFAULT 'REVIEW',
        mapping_note VARCHAR(300),
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT store_category_mapping_business_category_fk
          FOREIGN KEY (business_category_code)
          REFERENCES business_category(code),
        CONSTRAINT store_category_mapping_status_ck
          CHECK (mapping_status IN ('CONFIRMED', 'REVIEW', 'UNSUPPORTED'))
      )
    `);

    await queryRunner.query(`
      ALTER TABLE store
      ADD COLUMN IF NOT EXISTS service_business_category_code VARCHAR(30)
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'store_service_business_category_fk'
        ) THEN
          ALTER TABLE store
          ADD CONSTRAINT store_service_business_category_fk
            FOREIGN KEY (service_business_category_code)
            REFERENCES business_category(code);
        END IF;
      END $$
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS store_service_category_idx
      ON store (service_business_category_code)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS store_category_mapping_target_idx
      ON store_category_mapping (business_category_code)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE store
      DROP CONSTRAINT IF EXISTS store_service_business_category_fk
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS store_service_category_idx
    `);
    await queryRunner.query(`
      ALTER TABLE store
      DROP COLUMN IF EXISTS service_business_category_code
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS store_category_mapping
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS business_category
    `);
  }
}
