import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeAdministrativeAreaCodeUnique2026091000002 implements MigrationInterface {
  name = 'ChangeAdministrativeAreaCodeUnique2026091000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE administrative_area
      DROP CONSTRAINT IF EXISTS administrative_area_code_key
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'administrative_area_parent_id_code_key'
        ) THEN
          ALTER TABLE administrative_area
          ADD CONSTRAINT administrative_area_parent_id_code_key
          UNIQUE (parent_id, code);
        END IF;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE administrative_area
      DROP CONSTRAINT IF EXISTS administrative_area_parent_id_code_key
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'administrative_area_code_key'
        ) THEN
          ALTER TABLE administrative_area
          ADD CONSTRAINT administrative_area_code_key UNIQUE (code);
        END IF;
      END $$
    `);
  }
}
