import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSpaceAnalysisContext2026091100011 implements MigrationInterface {
  name = 'CreateSpaceAnalysisContext2026091100011';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    await queryRunner.query(`
      CREATE TABLE space_analysis_context (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id BIGINT NOT NULL REFERENCES users(id),
        longitude NUMERIC(10,7) NOT NULL,
        latitude NUMERIC(10,7) NOT NULL,
        candidate_building_ids JSONB NOT NULL,
        selected_building_id BIGINT NULL REFERENCES building(id),
        selected_registry_cache_id BIGINT NULL,
        selected_space_detail JSONB NULL,
        analysis_mode VARCHAR(30) NULL,
        status VARCHAR(40) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT space_analysis_context_longitude_check
          CHECK (longitude BETWEEN -180 AND 180),
        CONSTRAINT space_analysis_context_latitude_check
          CHECK (latitude BETWEEN -90 AND 90),
        CONSTRAINT space_analysis_context_candidate_ids_check
          CHECK (jsonb_typeof(candidate_building_ids) = 'array'),
        CONSTRAINT space_analysis_context_analysis_mode_check
          CHECK (
            analysis_mode IS NULL OR
            analysis_mode IN ('LOCATION_ONLY', 'SPACE_DETAIL')
          ),
        CONSTRAINT space_analysis_context_status_check
          CHECK (
            status IN (
              'POINT_RESOLVED',
              'BUILDING_SELECTED',
              'REGISTRY_LOADING',
              'DETAIL_SELECTION_REQUIRED',
              'SPACE_DETAIL_READY',
              'LOCATION_ONLY_READY',
              'ANALYZING',
              'COMPLETED',
              'FAILED',
              'EXPIRED'
            )
          )
      )
    `);

    await queryRunner.query(
      `CREATE INDEX space_analysis_context_user_created_idx ON space_analysis_context (user_id, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX space_analysis_context_expires_idx ON space_analysis_context (expires_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX space_analysis_context_selected_building_idx ON space_analysis_context (selected_building_id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS space_analysis_context_selected_building_idx',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS space_analysis_context_expires_idx',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS space_analysis_context_user_created_idx',
    );
    await queryRunner.query('DROP TABLE IF EXISTS space_analysis_context');
  }
}
