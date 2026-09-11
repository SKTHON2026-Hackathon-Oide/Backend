-- Read-only snapshot to run before a rebuild.
SELECT table_name,
       (xpath('/row/c/text()', query_to_xml(
         format('SELECT count(*) AS c FROM public.%I', table_name),
         false, true, ''
       )))[1]::text::bigint AS row_count
FROM (VALUES
  ('administrative_area'),
  ('building'),
  ('commercial_area'),
  ('commercial_area_building'),
  ('area_business_feature'),
  ('sales_statistic'),
  ('commercial_area_floating_population_statistic'),
  ('store'),
  ('land_use_zone'),
  ('commercial_area_feature')
) AS tables(table_name)
ORDER BY table_name;

SELECT
  'building' AS table_name,
  count(*) FILTER (
    WHERE geom IS NULL OR ST_IsEmpty(geom) OR ST_SRID(geom) <> 5186 OR NOT ST_IsValid(geom)
  ) AS invalid_geometry_count
FROM public.building
UNION ALL
SELECT
  'commercial_area',
  count(*) FILTER (
    WHERE geom IS NULL OR ST_IsEmpty(geom) OR ST_SRID(geom) <> 5186 OR NOT ST_IsValid(geom)
  )
FROM public.commercial_area
UNION ALL
SELECT
  'land_use_zone',
  count(*) FILTER (
    WHERE geom IS NULL OR ST_IsEmpty(geom) OR ST_SRID(geom) <> 5186 OR NOT ST_IsValid(geom)
  )
FROM public.land_use_zone;
