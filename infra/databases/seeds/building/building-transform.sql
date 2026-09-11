-- Transform the QGIS staging layer into the application `building` table.
-- A1 is almost unique, but repeated source IDs receive a deterministic suffix
-- so that no source geometry is discarded.
BEGIN;

WITH ranked_source AS (
  SELECT
    source.*,
    COUNT(*) OVER (PARTITION BY source.a1) AS source_id_count,
    ROW_NUMBER() OVER (
      PARTITION BY source.a1
      ORDER BY source.ogc_fid
    ) AS source_id_sequence
  FROM public.stg_building_import AS source
), prepared AS (
  SELECT
    CASE
      WHEN source_id_count = 1 THEN TRIM(a1)
      ELSE TRIM(a1) || '-' || source_id_sequence::varchar
    END AS source_building_id,
    NULLIF(TRIM(a2), '') AS pnu,
    NULLIF(TRIM(a3), '') AS legal_dong_code,
    LEFT(
      NULLIF(
        CONCAT_WS(' ', NULLIF(TRIM(a4), ''), NULLIF(TRIM(a5), '')),
        ''
      ),
      300
    ) AS jibun_address,
    LEFT(
      NULLIF(
        CONCAT_WS(
          ' ',
          NULLIF(TRIM(a24), ''),
          CASE
            WHEN NULLIF(TRIM(a25), '') IS DISTINCT FROM NULLIF(TRIM(a24), '')
              THEN NULLIF(TRIM(a25), '')
            ELSE NULL
          END
        ),
        ''
      ),
      200
    ) AS building_name,
    NULLIF(TRIM(a8), '') AS main_use_code,
    LEFT(NULLIF(TRIM(a9), ''), 100) AS main_use_name,
    NULLIF(a15, 0) AS land_area,
    NULLIF(a12, 0) AS building_area,
    NULLIF(a14, 0) AS total_floor_area,
    CASE
      -- building.building_coverage_ratio is NUMERIC(6,2). A17 has 12
      -- source outliers over 9,999.99, which cannot represent a ratio.
      WHEN ABS(a17) < 9999.995 THEN NULLIF(a17, 0)
      ELSE NULL
    END AS building_coverage_ratio,
    NULLIF(a18, 0) AS floor_area_ratio,
    NULLIF(a26, 0)::integer AS ground_floor_count,
    NULLIF(a27, 0)::integer AS underground_floor_count,
    CASE
      WHEN a13 ~ '^\d{4}-\d{2}-\d{2}$' THEN a13::date
      ELSE NULL
    END AS approval_date,
    ST_Multi(ST_CollectionExtract(ST_MakeValid(geom), 3)) AS geom
  FROM ranked_source
  WHERE a1 IS NOT NULL
    AND TRIM(a1) <> ''
    AND geom IS NOT NULL
    AND NOT ST_IsEmpty(geom)
)
INSERT INTO public.building (
  source_building_id,
  pnu,
  legal_dong_code,
  legal_dong_id,
  road_address,
  jibun_address,
  building_name,
  main_use_code,
  main_use_name,
  land_area,
  building_area,
  total_floor_area,
  building_coverage_ratio,
  floor_area_ratio,
  ground_floor_count,
  underground_floor_count,
  approval_date,
  geom
)
SELECT
  prepared.source_building_id,
  prepared.pnu,
  prepared.legal_dong_code,
  dong.id,
  NULL,
  prepared.jibun_address,
  prepared.building_name,
  prepared.main_use_code,
  prepared.main_use_name,
  prepared.land_area,
  prepared.building_area,
  prepared.total_floor_area,
  prepared.building_coverage_ratio,
  prepared.floor_area_ratio,
  prepared.ground_floor_count,
  prepared.underground_floor_count,
  prepared.approval_date,
  prepared.geom
FROM prepared
LEFT JOIN public.administrative_area AS district
  ON district.area_type = 'DISTRICT'
  AND district.code = LEFT(prepared.legal_dong_code, 5)
LEFT JOIN public.administrative_area AS dong
  ON dong.area_type = 'DONG'
  AND dong.parent_id = district.id
  AND district.code || dong.code = prepared.legal_dong_code
WHERE prepared.geom IS NOT NULL
  AND NOT ST_IsEmpty(prepared.geom)
ON CONFLICT (source_building_id) DO UPDATE
SET
  pnu = EXCLUDED.pnu,
  legal_dong_code = EXCLUDED.legal_dong_code,
  legal_dong_id = EXCLUDED.legal_dong_id,
  road_address = EXCLUDED.road_address,
  jibun_address = EXCLUDED.jibun_address,
  building_name = EXCLUDED.building_name,
  main_use_code = EXCLUDED.main_use_code,
  main_use_name = EXCLUDED.main_use_name,
  land_area = EXCLUDED.land_area,
  building_area = EXCLUDED.building_area,
  total_floor_area = EXCLUDED.total_floor_area,
  building_coverage_ratio = EXCLUDED.building_coverage_ratio,
  floor_area_ratio = EXCLUDED.floor_area_ratio,
  ground_floor_count = EXCLUDED.ground_floor_count,
  underground_floor_count = EXCLUDED.underground_floor_count,
  approval_date = EXCLUDED.approval_date,
  geom = EXCLUDED.geom,
  updated_at = now();

DROP TABLE public.stg_building_import;

COMMIT;
