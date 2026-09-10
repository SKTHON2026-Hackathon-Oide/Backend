import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnablePostgis0000000000000 implements MigrationInterface {
  name = 'EnablePostgis0000000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS postgis');
  }

  // PostGIS is shared database infrastructure. It is intentionally retained
  // when this migration is reverted so that another schema cannot be dropped.
  async down(_queryRunner: QueryRunner): Promise<void> {
    void _queryRunner;
  }
}
