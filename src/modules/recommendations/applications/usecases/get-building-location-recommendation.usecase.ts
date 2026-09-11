import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class GetBuildingLocationRecommendationUseCase {
  constructor(private readonly dataSource: DataSource) {}

  async execute(buildingId: string) {
    const [building] = await this.dataSource.query<
      {
        id: string;
        building_name: string | null;
        jibun_address: string | null;
      }[]
    >(
      `SELECT id::text AS id, building_name, jibun_address
       FROM building WHERE id = $1`,
      [buildingId],
    );
    if (!building) throw new NotFoundException('건물을 찾을 수 없습니다.');

    const commercialAreas = await this.dataSource.query<
      { id: string; name: string | null; overlap_ratio: string | null }[]
    >(
      `SELECT cab.commercial_area_id::text AS id, ca.name, cab.overlap_ratio
       FROM commercial_area_building cab
       JOIN commercial_area ca ON ca.id = cab.commercial_area_id
       WHERE cab.building_id = $1
       ORDER BY cab.overlap_ratio DESC NULLS LAST`,
      [buildingId],
    );
    const recommendations = await this.dataSource.query<
      {
        code: string;
        name: string | null;
        nearby_store_count: number;
        demand_score: string;
        competition_score: string;
        score: string;
      }[]
    >(
      `WITH linked AS (
         SELECT commercial_area_id FROM commercial_area_building WHERE building_id = $1
       ), latest AS (
         SELECT DISTINCT ON (commercial_area_id, business_category_code)
           commercial_area_id, business_category_code, store_count, demand_score, competition_score
         FROM area_business_feature
         WHERE commercial_area_id IN (SELECT commercial_area_id FROM linked)
         ORDER BY commercial_area_id, business_category_code, base_period DESC
       )
       SELECT l.business_category_code AS code, bc.name,
         COALESCE(SUM(l.store_count), 0)::int AS nearby_store_count,
         ROUND(AVG(COALESCE(l.demand_score, 0))::numeric, 2) AS demand_score,
         ROUND(AVG(COALESCE(l.competition_score, 0))::numeric, 2) AS competition_score,
         ROUND((AVG(COALESCE(l.demand_score, 0)) - AVG(COALESCE(l.competition_score, 0)) * 0.45)::numeric, 2) AS score
       FROM latest l JOIN business_category bc ON bc.code = l.business_category_code
       GROUP BY l.business_category_code, bc.name
       ORDER BY score DESC, nearby_store_count ASC, code
       LIMIT 5`,
      [buildingId],
    );
    const [population] = await this.dataSource.query<
      { top_hours: { time_range: string; population: number }[] }[]
    >(
      `WITH linked AS (
         SELECT commercial_area_id FROM commercial_area_building WHERE building_id = $1
       ), latest AS (
         SELECT DISTINCT ON (commercial_area_id) *
         FROM commercial_area_floating_population_statistic
         WHERE commercial_area_id IN (SELECT commercial_area_id FROM linked)
         ORDER BY commercial_area_id, base_period DESC
       ), hours AS (
         SELECT '00:00-06:00' AS time_range, COALESCE(SUM(time_00_06), 0)::int AS population FROM latest
         UNION ALL SELECT '06:00-11:00', COALESCE(SUM(time_06_11), 0)::int FROM latest
         UNION ALL SELECT '11:00-14:00', COALESCE(SUM(time_11_14), 0)::int FROM latest
         UNION ALL SELECT '14:00-17:00', COALESCE(SUM(time_14_17), 0)::int FROM latest
         UNION ALL SELECT '17:00-21:00', COALESCE(SUM(time_17_21), 0)::int FROM latest
         UNION ALL SELECT '21:00-24:00', COALESCE(SUM(time_21_24), 0)::int FROM latest
       ) SELECT COALESCE(json_agg(hours ORDER BY population DESC), '[]'::json) AS top_hours FROM hours`,
      [buildingId],
    );
    return {
      building: {
        id: building.id,
        name: building.building_name,
        address: building.jibun_address,
      },
      commercialAreas,
      recommendedBusinesses: recommendations,
      topOperatingHours: population?.top_hours ?? [],
    };
  }
}
