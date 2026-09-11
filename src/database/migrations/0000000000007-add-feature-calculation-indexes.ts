import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFeatureCalculationIndexes2026091000007 implements MigrationInterface {
  name = 'AddFeatureCalculationIndexes2026091000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS area_business_feature_category_period_idx
      ON area_business_feature (business_category_code, base_period)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS sales_statistic_category_period_idx
      ON sales_statistic (business_category_code, base_period)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS area_business_feature_category_period_idx',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS sales_statistic_category_period_idx',
    );
  }
}
