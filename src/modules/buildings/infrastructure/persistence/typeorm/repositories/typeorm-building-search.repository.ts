import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  BuildingCandidate,
  BuildingSearchPoint,
  BuildingSearchPort,
} from '../../../../domain/ports/building-search.port';

interface BuildingCandidateRow {
  building_id: string;
  match_type: 'INTERSECTS' | 'NEARBY';
  distance_meters: string | number;
  building_name: string | null;
  jibun_address: string | null;
  main_use_name: string | null;
  building_area_sqm: string | number | null;
  total_floor_area_sqm: string | number | null;
  ground_floor_count: number | null;
  geometry: string | { type: 'MultiPolygon'; coordinates: unknown };
}

interface BooleanRow {
  in_service_area: boolean;
}

@Injectable()
export class TypeOrmBuildingSearchRepository implements BuildingSearchPort {
  constructor(private readonly dataSource: DataSource) {}

  async isInSeoul(point: BuildingSearchPoint): Promise<boolean> {
    const rows = await this.dataSource.query<BooleanRow[]>(
      `
        WITH input AS (
          SELECT ST_Transform(
            ST_SetSRID(ST_Point($1, $2), 4326),
            5186
          ) AS point
        )
        SELECT EXISTS (
          SELECT 1
          FROM administrative_area AS area
          CROSS JOIN input
          WHERE area.code LIKE '11%'
            AND area.area_type IN ('SI_DO', 'CITY', 'DISTRICT', 'DONG')
            AND ST_Covers(area.geom, input.point)
        ) AS in_service_area
      `,
      [point.longitude, point.latitude],
    );

    return rows[0]?.in_service_area ?? false;
  }

  async findCandidates(
    point: BuildingSearchPoint,
    limit: number,
  ): Promise<BuildingCandidate[]> {
    const exactRows = await this.dataSource.query<BuildingCandidateRow[]>(
      this.candidateQuery(false),
      [point.longitude, point.latitude, limit],
    );

    if (exactRows.length > 0) {
      return exactRows.map((row) => this.mapCandidate(row));
    }

    const nearbyRows = await this.dataSource.query<BuildingCandidateRow[]>(
      this.candidateQuery(true),
      [point.longitude, point.latitude, limit],
    );
    return nearbyRows.map((row) => this.mapCandidate(row));
  }

  private candidateQuery(nearby: boolean): string {
    const predicate = nearby
      ? 'ST_DWithin(building.geom, input.point, 10)'
      : 'ST_Covers(building.geom, input.point)';
    const order = nearby
      ? 'ST_Distance(building.geom, input.point), building.id'
      : 'ST_Area(building.geom), building.id';
    const matchType = nearby ? "'NEARBY'" : "'INTERSECTS'";

    return `
      WITH input AS (
        SELECT ST_Transform(
          ST_SetSRID(ST_Point($1, $2), 4326),
          5186
        ) AS point
      )
      SELECT
        building.id::text AS building_id,
        ${matchType} AS match_type,
        CASE
          WHEN ${nearby} THEN ST_Distance(building.geom, input.point)
          ELSE 0
        END AS distance_meters,
        building.building_name,
        building.jibun_address,
        building.main_use_name,
        building.building_area AS building_area_sqm,
        building.total_floor_area AS total_floor_area_sqm,
        building.ground_floor_count,
        ST_AsGeoJSON(
          ST_Transform(
            ST_SimplifyPreserveTopology(building.geom, 0.25),
            4326
          ),
          6,
          0
        ) AS geometry
      FROM building
      CROSS JOIN input
      WHERE ${predicate}
      ORDER BY ${order}
      LIMIT $3
    `;
  }

  private mapCandidate(row: BuildingCandidateRow): BuildingCandidate {
    const geometry =
      typeof row.geometry === 'string'
        ? (JSON.parse(row.geometry) as BuildingCandidate['geometry'])
        : row.geometry;

    return {
      buildingId: row.building_id,
      matchType: row.match_type,
      distanceMeters: Number(row.distance_meters),
      buildingName: row.building_name,
      jibunAddress: row.jibun_address,
      mainUseName: row.main_use_name,
      buildingAreaSqm: this.toNullableNumber(row.building_area_sqm),
      totalFloorAreaSqm: this.toNullableNumber(row.total_floor_area_sqm),
      groundFloorCount: row.ground_floor_count,
      geometry,
    };
  }

  private toNullableNumber(value: string | number | null): number | null {
    if (value === null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
