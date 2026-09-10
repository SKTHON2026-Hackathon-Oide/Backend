import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeAdministrativeAreaCodeUnique0000000000002
  implements MigrationInterface
{
  name = 'ChangeAdministrativeAreaCodeUnique0000000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE administrative_area
      DROP CONSTRAINT IF EXISTS administrative_area_code_key
    `);
    await queryRunner.query(`
      ALTER TABLE administrative_area
      ADD CONSTRAINT administrative_area_parent_id_code_key
      UNIQUE (parent_id, code)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE administrative_area
      DROP CONSTRAINT IF EXISTS administrative_area_parent_id_code_key
    `);
    await queryRunner.query(`
      ALTER TABLE administrative_area
      ADD CONSTRAINT administrative_area_code_key UNIQUE (code)
    `);
  }
}
