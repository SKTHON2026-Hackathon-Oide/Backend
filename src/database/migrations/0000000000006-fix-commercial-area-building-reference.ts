import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The application building dataset lives in `building`. The baseline ERD
 * accidentally pointed this bridge at the legacy, empty `gis_building` table.
 */
export class FixCommercialAreaBuildingReference2026091000006 implements MigrationInterface {
  name = 'FixCommercialAreaBuildingReference2026091000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const result: unknown = await queryRunner.query(
      'SELECT count(*)::bigint AS count FROM commercial_area_building',
    );
    const rows = result as Array<{ count?: unknown }>;
    const count = Number(rows[0]?.count ?? 0);

    if (count > 0) {
      throw new Error(
        'commercial_area_building is not empty. Export/reconcile its rows before applying migration 0000000000006.',
      );
    }

    await queryRunner.query('DROP TABLE IF EXISTS commercial_area_building');
    await queryRunner.query(`
      CREATE TABLE commercial_area_building (
        commercial_area_id BIGINT NOT NULL REFERENCES commercial_area(id),
        building_id BIGINT NOT NULL REFERENCES building(id),
        overlap_ratio NUMERIC(6,5),
        calculated_at TIMESTAMP NOT NULL DEFAULT now(),
        PRIMARY KEY (commercial_area_id, building_id),
        CONSTRAINT commercial_area_building_overlap_ratio_ck
          CHECK (overlap_ratio IS NULL OR (overlap_ratio >= 0 AND overlap_ratio <= 1))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX commercial_area_building_building_idx
      ON commercial_area_building (building_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const result: unknown = await queryRunner.query(
      'SELECT count(*)::bigint AS count FROM commercial_area_building',
    );
    const rows = result as Array<{ count?: unknown }>;
    const count = Number(rows[0]?.count ?? 0);

    if (count > 0) {
      throw new Error(
        'commercial_area_building is not empty. Remove derived links before reverting migration 0000000000006.',
      );
    }

    await queryRunner.query('DROP TABLE IF EXISTS commercial_area_building');
    await queryRunner.query(`
      CREATE TABLE commercial_area_building (
        commercial_area_id BIGINT NOT NULL REFERENCES commercial_area(id),
        gis_building_id BIGINT NOT NULL REFERENCES gis_building(id),
        overlap_ratio NUMERIC(6,5),
        calculated_at TIMESTAMP NOT NULL DEFAULT now(),
        PRIMARY KEY (commercial_area_id, gis_building_id)
      )
    `);
  }
}
