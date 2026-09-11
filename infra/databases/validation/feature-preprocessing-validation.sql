-- Final, read-only gate for the preprocessing pipeline.
DO $validation$
DECLARE
  missing_category_count bigint;
  invalid_link_count bigint;
  invalid_score_count bigint;
  invalid_geometry_count bigint;
  staging_table_count bigint;
BEGIN
  SELECT count(*) INTO missing_category_count
  FROM (
    SELECT DISTINCT business_category_code FROM public.area_business_feature
    EXCEPT
    SELECT code FROM public.business_category
  ) AS missing;

  SELECT count(*) INTO invalid_link_count
  FROM public.commercial_area_building AS link
  LEFT JOIN public.commercial_area AS area
    ON area.id = link.commercial_area_id
  LEFT JOIN public.building
    ON building.id = link.building_id
  WHERE area.id IS NULL
     OR building.id IS NULL
     OR link.overlap_ratio IS NULL
     OR link.overlap_ratio < 0
     OR link.overlap_ratio > 1;

  SELECT count(*) INTO invalid_score_count
  FROM public.area_business_feature
  WHERE (competition_score IS NOT NULL AND (competition_score < 0 OR competition_score > 100))
     OR (demand_score IS NOT NULL AND (demand_score < 0 OR demand_score > 100));

  SELECT count(*) INTO invalid_geometry_count
  FROM (
    SELECT geom FROM public.building
    UNION ALL SELECT geom FROM public.commercial_area
    UNION ALL SELECT geom FROM public.land_use_zone
  ) AS geometries
  WHERE geom IS NULL OR ST_IsEmpty(geom) OR ST_SRID(geom) <> 5186 OR NOT ST_IsValid(geom);

  SELECT count(*) INTO staging_table_count
  FROM pg_class AS relation
  JOIN pg_namespace AS schema_row ON schema_row.oid = relation.relnamespace
  WHERE schema_row.nspname = 'public'
    AND relation.relkind IN ('r', 'p')
    AND left(relation.relname, 4) = 'stg_';

  IF missing_category_count > 0
     OR invalid_link_count > 0
     OR invalid_score_count > 0
     OR invalid_geometry_count > 0
     OR staging_table_count > 0 THEN
    RAISE EXCEPTION
      'Preprocessing validation failed (missing categories %, invalid links %, invalid scores %, invalid geometries %, staging tables %).',
      missing_category_count,
      invalid_link_count,
      invalid_score_count,
      invalid_geometry_count,
      staging_table_count;
  END IF;

  RAISE NOTICE 'Preprocessing validation passed.';
END;
$validation$;

SELECT
  (SELECT count(*) FROM public.business_category) AS canonical_category_count,
  (SELECT count(*) FROM public.store_category_mapping) AS source_mapping_count,
  (SELECT count(*) FROM public.store WHERE service_business_category_code IS NOT NULL)
    AS normalized_store_count,
  (SELECT count(*) FROM public.commercial_area_building) AS building_area_link_count,
  (SELECT count(*) FROM public.area_business_feature
   WHERE competition_score IS NOT NULL) AS competition_scored_count,
  (SELECT count(*) FROM public.area_business_feature
   WHERE demand_score IS NOT NULL) AS demand_scored_count;
