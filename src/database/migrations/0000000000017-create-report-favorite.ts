import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReportFavorite2026091200017 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE report_favorite (
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      favorite_id VARCHAR(512) NOT NULL,
      summary JSONB NOT NULL,
      report JSONB NOT NULL,
      report_bytes INTEGER NOT NULL CHECK (report_bytes BETWEEN 1 AND 3145728),
      saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, favorite_id)
    )`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE report_favorite');
  }
}
