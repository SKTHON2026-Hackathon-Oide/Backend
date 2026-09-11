import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ResolvedAdministrativeArea } from '../../recommendations/domain/business-location-recommendation.types';

@Injectable()
export class ResolveAdministrativeAreaService {
  constructor(private readonly dataSource: DataSource) {}

  async resolve(
    longitude: number,
    latitude: number,
  ): Promise<ResolvedAdministrativeArea> {
    const rows = await this.dataSource.query<
      Array<{
        id: string;
        code: string;
        name: string;
        area_type: string;
        parent_id: string | null;
        parent_code: string | null;
        parent_name: string | null;
        match_method: 'CONTAINS' | 'BOUNDARY';
      }>
    >(
      `
      WITH input AS (
        SELECT ST_Transform(ST_SetSRID(ST_Point($1, $2), 4326), 5186) AS point
      ), matches AS (
        SELECT a.id::text AS id, a.code, a.name, a.area_type,
               a.parent_id::text AS parent_id, p.code AS parent_code, p.name AS parent_name,
               CASE WHEN ST_Contains(a.geom, input.point) THEN 'CONTAINS' ELSE 'BOUNDARY' END AS match_method,
               ST_Area(a.geom) AS area_size
        FROM administrative_area a
        CROSS JOIN input
        LEFT JOIN administrative_area p ON p.id = a.parent_id
        WHERE a.code LIKE '11%'
          AND a.area_type IN ('DONG', 'DISTRICT', 'CITY', 'SI_DO')
          AND ST_Covers(a.geom, input.point)
      )
      SELECT id, code, name, area_type, parent_id, parent_code, parent_name, match_method
      FROM matches
      ORDER BY CASE area_type WHEN 'DONG' THEN 1 WHEN 'DISTRICT' THEN 2 WHEN 'CITY' THEN 3 ELSE 4 END,
               CASE match_method WHEN 'CONTAINS' THEN 1 ELSE 2 END,
               area_size ASC, code
      LIMIT 1
    `,
      [longitude, latitude],
    );
    const row = rows[0];
    if (!row)
      throw new NotFoundException({
        code: 'ADMINISTRATIVE_AREA_NOT_FOUND',
        message: '좌표에 해당하는 행정구역을 찾을 수 없습니다.',
      });
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      areaType: row.area_type,
      parentId: row.parent_id,
      parentCode: row.parent_code,
      parentName: row.parent_name,
      matchMethod: row.match_method,
    };
  }
}
