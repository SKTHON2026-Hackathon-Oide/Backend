-- Rebuild the derived building-to-commercial-area bridge.
-- Both datasets use EPSG:5186, whose units are metres, so ST_Area ratios are
-- suitable for the overlap metric. Buildings that touch only on a boundary
-- (zero intersection area) are deliberately excluded.
BEGIN;
SET LOCAL statement_timeout = 0;

DO $preflight$
DECLARE
  invalid_building_count bigint;
  invalid_area_count bigint;
BEGIN
  SELECT count(*) INTO invalid_building_count
  FROM public.building
  WHERE geom IS NULL
     OR ST_IsEmpty(geom)
     OR ST_SRID(geom) <> 5186
     OR NOT ST_IsValid(geom);

  SELECT count(*) INTO invalid_area_count
  FROM public.commercial_area
  WHERE geom IS NULL
     OR ST_IsEmpty(geom)
     OR ST_SRID(geom) <> 5186
     OR NOT ST_IsValid(geom);

  IF invalid_building_count > 0 OR invalid_area_count > 0 THEN
    RAISE EXCEPTION
      'Spatial preflight failed (invalid buildings %, invalid commercial areas %).',
      invalid_building_count, invalid_area_count;
  END IF;
END;
$preflight$;

ANALYZE public.building;
ANALYZE public.commercial_area;
TRUNCATE TABLE public.commercial_area_building;

WITH intersections AS (
  SELECT
    area.id AS commercial_area_id,
    building.id AS building_id,
    ST_Area(ST_Intersection(area.geom, building.geom)) AS overlap_area,
    ST_Area(building.geom) AS building_area
  FROM public.building AS building
  JOIN public.commercial_area AS area
    ON building.geom && area.geom
   AND ST_Intersects(building.geom, area.geom)
), normalized AS (
  SELECT
    commercial_area_id,
    building_id,
    LEAST(
      1::numeric,
      GREATEST(
        0::numeric,
        overlap_area / NULLIF(building_area, 0)
      )
    ) AS overlap_ratio
  FROM intersections
  WHERE overlap_area > 0
    AND building_area > 0
)
INSERT INTO public.commercial_area_building (
  commercial_area_id,
  building_id,
  overlap_ratio,
  calculated_at
)
SELECT
  commercial_area_id,
  building_id,
  round(overlap_ratio::numeric, 5)::numeric(6,5),
  now()
FROM normalized
ON CONFLICT (commercial_area_id, building_id) DO UPDATE
SET overlap_ratio = EXCLUDED.overlap_ratio,
    calculated_at = now();

DO $result_check$
DECLARE
  invalid_ratio_count bigint;
  orphan_count bigint;
BEGIN
  SELECT count(*) INTO invalid_ratio_count
  FROM public.commercial_area_building
  WHERE overlap_ratio IS NULL
     OR overlap_ratio < 0
     OR overlap_ratio > 1;

  SELECT count(*) INTO orphan_count
  FROM public.commercial_area_building AS link
  LEFT JOIN public.commercial_area AS area
    ON area.id = link.commercial_area_id
  LEFT JOIN public.building
    ON building.id = link.building_id
  WHERE area.id IS NULL OR building.id IS NULL;

  IF invalid_ratio_count > 0 OR orphan_count > 0 THEN
    RAISE EXCEPTION
      'Building-area bridge validation failed (invalid ratios %, orphan rows %).',
      invalid_ratio_count, orphan_count;
  END IF;
END;
$result_check$;

COMMIT;
