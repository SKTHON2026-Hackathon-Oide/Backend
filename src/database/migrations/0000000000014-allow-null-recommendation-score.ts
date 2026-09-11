import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowNullRecommendationScore2026091100014 implements MigrationInterface {
  name = 'AllowNullRecommendationScore2026091100014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE recommendation_request ALTER COLUMN prompt_version SET DEFAULT 'location-business-agent-v2'`,
    );
    await queryRunner.query(
      'ALTER TABLE space_business_recommendation_result ALTER COLUMN total_score DROP NOT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM space_business_recommendation_result WHERE total_score IS NULL`,
    );
    await queryRunner.query(
      'ALTER TABLE space_business_recommendation_result ALTER COLUMN total_score SET NOT NULL',
    );
    await queryRunner.query(
      `ALTER TABLE recommendation_request ALTER COLUMN prompt_version SET DEFAULT 'location-business-agent-v1'`,
    );
  }
}
