import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropLegacyBuildingPnuUnique2026091000004 implements MigrationInterface {
  name = 'DropLegacyBuildingPnuUnique2026091000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        constraint_name text;
      BEGIN
        FOR constraint_name IN
          SELECT constraint_row.conname
          FROM pg_constraint AS constraint_row
          JOIN pg_class AS table_row
            ON table_row.oid = constraint_row.conrelid
          JOIN pg_namespace AS schema_row
            ON schema_row.oid = table_row.relnamespace
          WHERE schema_row.nspname = 'public'
            AND table_row.relname = 'building'
            AND constraint_row.contype = 'u'
            AND constraint_row.conkey = ARRAY[
              (
                SELECT attribute_row.attnum
                FROM pg_attribute AS attribute_row
                WHERE attribute_row.attrelid = table_row.oid
                  AND attribute_row.attname = 'pnu'
                  AND NOT attribute_row.attisdropped
              )
            ]::smallint[]
        LOOP
          EXECUTE format(
            'ALTER TABLE public.building DROP CONSTRAINT %I',
            constraint_name
          );
        END LOOP;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE building
      ADD CONSTRAINT building_pnu_key UNIQUE (pnu)
    `);
  }
}
