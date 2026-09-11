import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  BuildingForRegistry,
  BuildingLookupPort,
} from '../../../../domain/ports/building-lookup.port';

interface BuildingLookupRow {
  building_id: string;
  pnu: string | null;
  building_name: string | null;
  jibun_address: string | null;
  main_use_name: string | null;
  ground_floor_count: number | null;
  underground_floor_count: number | null;
  total_floor_area_sqm: string | number | null;
}

@Injectable()
export class TypeOrmBuildingLookupRepository implements BuildingLookupPort {
  constructor(private readonly dataSource: DataSource) {}

  async findById(buildingId: string): Promise<BuildingForRegistry | null> {
    const rows = await this.dataSource.query<BuildingLookupRow[]>(
      `
        SELECT
          id::text AS building_id,
          pnu,
          building_name,
          jibun_address,
          main_use_name,
          ground_floor_count,
          underground_floor_count,
          total_floor_area AS total_floor_area_sqm
        FROM building
        WHERE id = $1
        LIMIT 1
      `,
      [buildingId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      buildingId: row.building_id,
      pnu: row.pnu,
      buildingName: row.building_name,
      jibunAddress: row.jibun_address,
      mainUseName: row.main_use_name,
      groundFloorCount: row.ground_floor_count,
      undergroundFloorCount: row.underground_floor_count,
      totalFloorAreaSqm:
        row.total_floor_area_sqm === null
          ? null
          : Number(row.total_floor_area_sqm),
    };
  }
}
