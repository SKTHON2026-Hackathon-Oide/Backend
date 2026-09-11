-- Seoul commercial-area staging data -> public.commercial_area
-- Run commercial-area-staging.sql first.

BEGIN;

DO $validation$
DECLARE
  source_count bigint;
  invalid_count bigint;
BEGIN
  IF to_regclass('public.stg_commercial_area_import') IS NULL THEN
    RAISE EXCEPTION
      'public.stg_commercial_area_import does not exist. Run commercial-area-staging.sql first.';
  END IF;

  SELECT count(*)
    INTO source_count
    FROM public.stg_commercial_area_import;

  IF source_count <> 1650 THEN
    RAISE EXCEPTION
      'Unexpected staging row count: % (expected 1650).', source_count;
  END IF;

  SELECT count(*)
    INTO invalid_count
    FROM public.stg_commercial_area_import
   WHERE nullif(btrim(trdar_cd), '') IS NULL
      OR nullif(btrim(trdar_cd_n), '') IS NULL
      OR geom IS NULL
      OR ST_IsEmpty(geom)
      OR ST_IsEmpty(
        ST_CollectionExtract(ST_MakeValid(ST_Force2D(geom)), 3)
      );

  IF invalid_count > 0 THEN
    RAISE EXCEPTION
      'Staging contains % rows with a missing code, name, or geometry.', invalid_count;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.stg_commercial_area_import
     GROUP BY btrim(trdar_cd)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Staging contains duplicate commercial-area codes.';
  END IF;
END;
$validation$;

INSERT INTO public.commercial_area (
  commercial_area_code,
  commercial_area_name,
  commercial_area_type,
  geom,
  created_at,
  updated_at
)
SELECT
  btrim(trdar_cd) AS commercial_area_code,
  btrim(trdar_cd_n) AS commercial_area_name,
  nullif(btrim(trdar_se_1), '') AS commercial_area_type,
  ST_Multi(
    ST_CollectionExtract(
      ST_MakeValid(ST_Force2D(geom)),
      3
    )
  )::geometry(MultiPolygon, 5186) AS geom,
  now() AS created_at,
  now() AS updated_at
FROM public.stg_commercial_area_import
ON CONFLICT (commercial_area_code) DO UPDATE
SET commercial_area_name = EXCLUDED.commercial_area_name,
    commercial_area_type = EXCLUDED.commercial_area_type,
    geom = EXCLUDED.geom,
    updated_at = now();

DO $result_check$
DECLARE
  imported_count bigint;
BEGIN
  SELECT count(*)
    INTO imported_count
    FROM public.commercial_area AS ca
    JOIN public.stg_commercial_area_import AS staging
      ON btrim(staging.trdar_cd) = ca.commercial_area_code;

  IF imported_count <> 1650 THEN
    RAISE EXCEPTION
      'Commercial-area import verification failed: % rows found (expected 1650).',
      imported_count;
  END IF;
END;
$result_check$;

DROP TABLE public.stg_commercial_area_import;

COMMIT;
