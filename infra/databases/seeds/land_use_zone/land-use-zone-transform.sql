-- Seoul national-land-planning urban zones (UQ111, August 2026)
-- -> public.land_use_zone
-- Run land-use-zone-staging.sql first.

BEGIN;

DO $validation$
DECLARE
  source_count bigint;
  zone_code_count bigint;
  invalid_count bigint;
  unknown_code_count bigint;
BEGIN
  IF to_regclass('public.stg_land_use_zone_import') IS NULL THEN
    RAISE EXCEPTION
      'public.stg_land_use_zone_import does not exist. Run land-use-zone-staging.sql first.';
  END IF;

  SELECT count(*), count(DISTINCT substring(btrim(mnum) FROM 21 FOR 6))
    INTO source_count, zone_code_count
    FROM public.stg_land_use_zone_import;

  IF source_count <> 6743 THEN
    RAISE EXCEPTION
      'Unexpected staging row count: % (expected 6743).', source_count;
  END IF;

  IF zone_code_count <> 17 THEN
    RAISE EXCEPTION
      'Unexpected zone-code count: % (expected 17).', zone_code_count;
  END IF;

  SELECT count(*)
    INTO invalid_count
    FROM public.stg_land_use_zone_import
   WHERE mnum IS NULL
      OR length(btrim(mnum)) <> 33
      OR substring(btrim(mnum) FROM 21 FOR 6) !~ '^UQA[0-9]{3}$'
      OR geom IS NULL
      OR ST_IsEmpty(geom)
      OR ST_SRID(geom) <> 5186
      OR NOT ST_IsValid(geom);

  IF invalid_count > 0 THEN
    RAISE EXCEPTION
      'Staging contains % rows with invalid identifiers or geometry.', invalid_count;
  END IF;

  SELECT count(DISTINCT substring(btrim(mnum) FROM 21 FOR 6))
    INTO unknown_code_count
    FROM public.stg_land_use_zone_import
   WHERE substring(btrim(mnum) FROM 21 FOR 6) NOT IN (
     'UQA110', 'UQA111', 'UQA112',
     'UQA120', 'UQA121', 'UQA122', 'UQA123', 'UQA130',
     'UQA210', 'UQA220', 'UQA230', 'UQA240',
     'UQA330',
     'UQA410', 'UQA420', 'UQA430',
     'UQA999'
   );

  IF unknown_code_count > 0 THEN
    RAISE EXCEPTION
      'Staging contains % unmapped zone codes.', unknown_code_count;
  END IF;
END;
$validation$;

WITH source_codes AS (
  SELECT DISTINCT substring(btrim(mnum) FROM 21 FOR 6) AS zone_code
  FROM public.stg_land_use_zone_import
)
DELETE FROM public.land_use_zone AS target
USING source_codes
WHERE target.zone_code = source_codes.zone_code;

WITH zone_code_map(zone_code, zone_name, category) AS (
  VALUES
    ('UQA110', '전용주거지역', 'RESIDENTIAL'),
    ('UQA111', '제1종전용주거지역', 'RESIDENTIAL'),
    ('UQA112', '제2종전용주거지역', 'RESIDENTIAL'),
    ('UQA120', '일반주거지역', 'RESIDENTIAL'),
    ('UQA121', '제1종일반주거지역', 'RESIDENTIAL'),
    ('UQA122', '제2종일반주거지역', 'RESIDENTIAL'),
    ('UQA123', '제3종일반주거지역', 'RESIDENTIAL'),
    ('UQA130', '준주거지역', 'RESIDENTIAL'),
    ('UQA210', '중심상업지역', 'COMMERCIAL'),
    ('UQA220', '일반상업지역', 'COMMERCIAL'),
    ('UQA230', '근린상업지역', 'COMMERCIAL'),
    ('UQA240', '유통상업지역', 'COMMERCIAL'),
    ('UQA330', '준공업지역', 'INDUSTRIAL'),
    ('UQA410', '보전녹지지역', 'GREEN'),
    ('UQA420', '생산녹지지역', 'GREEN'),
    ('UQA430', '자연녹지지역', 'GREEN'),
    ('UQA999', '기타용도지역', 'OTHER')
),
dissolved AS (
  SELECT
    substring(btrim(source.mnum) FROM 21 FOR 6) AS zone_code,
    ST_Multi(
      ST_CollectionExtract(
        ST_UnaryUnion(
          ST_Collect(
            ST_CollectionExtract(
              ST_MakeValid(ST_Force2D(source.geom)),
              3
            )
          )
        ),
        3
      )
    )::geometry(MultiPolygon, 5186) AS geom
  FROM public.stg_land_use_zone_import AS source
  GROUP BY substring(btrim(source.mnum) FROM 21 FOR 6)
)
INSERT INTO public.land_use_zone (
  zone_code,
  zone_name,
  category,
  geom
)
SELECT
  mapping.zone_code,
  mapping.zone_name,
  mapping.category,
  dissolved.geom
FROM dissolved
JOIN zone_code_map AS mapping
  ON mapping.zone_code = dissolved.zone_code;

DO $result_check$
DECLARE
  imported_count bigint;
  invalid_result_count bigint;
BEGIN
  SELECT count(*)
    INTO imported_count
    FROM public.land_use_zone
   WHERE zone_code IN (
     'UQA110', 'UQA111', 'UQA112',
     'UQA120', 'UQA121', 'UQA122', 'UQA123', 'UQA130',
     'UQA210', 'UQA220', 'UQA230', 'UQA240',
     'UQA330',
     'UQA410', 'UQA420', 'UQA430',
     'UQA999'
   );

  IF imported_count <> 17 THEN
    RAISE EXCEPTION
      'Land-use-zone import verification failed: % rows found (expected 17).',
      imported_count;
  END IF;

  SELECT count(*)
    INTO invalid_result_count
    FROM public.land_use_zone
   WHERE zone_code IN (
     'UQA110', 'UQA111', 'UQA112',
     'UQA120', 'UQA121', 'UQA122', 'UQA123', 'UQA130',
     'UQA210', 'UQA220', 'UQA230', 'UQA240',
     'UQA330',
     'UQA410', 'UQA420', 'UQA430',
     'UQA999'
   )
     AND (
       geom IS NULL
       OR ST_IsEmpty(geom)
       OR ST_SRID(geom) <> 5186
       OR NOT ST_IsValid(geom)
     );

  IF invalid_result_count > 0 THEN
    RAISE EXCEPTION
      'Land-use-zone result contains % invalid geometries.',
      invalid_result_count;
  END IF;
END;
$result_check$;

DROP TABLE public.stg_land_use_zone_import;

COMMIT;
