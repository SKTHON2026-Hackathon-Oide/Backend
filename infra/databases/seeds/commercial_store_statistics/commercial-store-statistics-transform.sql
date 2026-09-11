-- Seoul commercial-area store statistics (2025)
-- -> public.area_business_feature
-- -> fills store counts in public.sales_statistic
-- Run commercial-store-statistics-staging.sql first.

BEGIN;

DO $validation$
DECLARE
  source_count bigint;
  invalid_count bigint;
  unmatched_area_count bigint;
BEGIN
  IF to_regclass('public.stg_commercial_store_statistic_import') IS NULL THEN
    RAISE EXCEPTION
      'public.stg_commercial_store_statistic_import does not exist. Run commercial-store-statistics-staging.sql first.';
  END IF;

  SELECT count(*)
    INTO source_count
    FROM public.stg_commercial_store_statistic_import;

  IF source_count <> 304775 THEN
    RAISE EXCEPTION
      'Unexpected staging row count: % (expected 304775).', source_count;
  END IF;

  SELECT count(*)
    INTO invalid_count
    FROM public.stg_commercial_store_statistic_import
   WHERE btrim(stdr_yyqu_cd) !~ '^2025[1-4]$'
      OR nullif(btrim(trdar_cd), '') IS NULL
      OR nullif(btrim(svc_induty_cd), '') IS NULL
      OR btrim(stor_co) !~ '^[0-9]+$'
      OR btrim(clsbiz_rt) !~ '^[0-9]+([.][0-9]+)?$'
      OR btrim(clsbiz_stor_co) !~ '^[0-9]+$';

  IF invalid_count > 0 THEN
    RAISE EXCEPTION
      'Staging contains % rows with invalid keys or numeric values.', invalid_count;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.stg_commercial_store_statistic_import
     GROUP BY btrim(stdr_yyqu_cd), btrim(trdar_cd), btrim(svc_induty_cd)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Staging contains duplicate period, commercial-area, and business-category keys.';
  END IF;

  SELECT count(DISTINCT btrim(source.trdar_cd))
    INTO unmatched_area_count
    FROM public.stg_commercial_store_statistic_import AS source
    LEFT JOIN public.commercial_area AS area
      ON area.commercial_area_code = btrim(source.trdar_cd)
   WHERE area.id IS NULL;

  IF unmatched_area_count > 0 THEN
    RAISE EXCEPTION
      'Staging contains % commercial-area codes not found in public.commercial_area.',
      unmatched_area_count;
  END IF;
END;
$validation$;

WITH normalized AS (
  SELECT
    area.id AS commercial_area_id,
    btrim(source.svc_induty_cd) AS business_category_code,
    make_date(
      left(btrim(source.stdr_yyqu_cd), 4)::integer,
      ((right(btrim(source.stdr_yyqu_cd), 1)::integer - 1) * 3) + 1,
      1
    ) AS base_period,
    btrim(source.stor_co)::integer AS store_count,
    round(
      btrim(source.clsbiz_rt)::numeric / 100,
      4
    )::numeric(6, 4) AS closure_rate
  FROM public.stg_commercial_store_statistic_import AS source
  JOIN public.commercial_area AS area
    ON area.commercial_area_code = btrim(source.trdar_cd)
)
INSERT INTO public.area_business_feature AS target (
  commercial_area_id,
  business_category_code,
  base_period,
  store_count,
  estimated_sales_amount,
  closure_rate,
  competition_score,
  demand_score,
  updated_at
)
SELECT
  normalized.commercial_area_id,
  normalized.business_category_code,
  normalized.base_period,
  normalized.store_count,
  sales.estimated_sales_amount,
  normalized.closure_rate,
  NULL::numeric(8, 4) AS competition_score,
  NULL::numeric(8, 4) AS demand_score,
  now() AS updated_at
FROM normalized
LEFT JOIN public.sales_statistic AS sales
  ON sales.commercial_area_id = normalized.commercial_area_id
 AND sales.business_category_code = normalized.business_category_code
 AND sales.base_period = normalized.base_period
ON CONFLICT (commercial_area_id, business_category_code, base_period) DO UPDATE
SET store_count = EXCLUDED.store_count,
    estimated_sales_amount = COALESCE(
      EXCLUDED.estimated_sales_amount,
      target.estimated_sales_amount
    ),
    closure_rate = EXCLUDED.closure_rate,
    updated_at = now();

WITH normalized AS (
  SELECT
    area.id AS commercial_area_id,
    btrim(source.svc_induty_cd) AS business_category_code,
    make_date(
      left(btrim(source.stdr_yyqu_cd), 4)::integer,
      ((right(btrim(source.stdr_yyqu_cd), 1)::integer - 1) * 3) + 1,
      1
    ) AS base_period,
    btrim(source.stor_co)::integer AS store_count,
    btrim(source.clsbiz_stor_co)::integer AS closed_store_count
  FROM public.stg_commercial_store_statistic_import AS source
  JOIN public.commercial_area AS area
    ON area.commercial_area_code = btrim(source.trdar_cd)
)
UPDATE public.sales_statistic AS sales
SET store_count = normalized.store_count,
    closed_store_count = normalized.closed_store_count,
    updated_at = now()
FROM normalized
WHERE sales.commercial_area_id = normalized.commercial_area_id
  AND sales.business_category_code = normalized.business_category_code
  AND sales.base_period = normalized.base_period;

DO $result_check$
DECLARE
  feature_count bigint;
  updated_sales_count bigint;
BEGIN
  SELECT count(*)
INTO feature_count
FROM public.area_business_feature
WHERE base_period >= DATE '2025-01-01'
  AND base_period < DATE '2026-01-01';

SELECT count(*)
INTO updated_sales_count
FROM public.sales_statistic
WHERE base_period >= DATE '2025-01-01'
  AND base_period < DATE '2026-01-01'
  AND store_count IS NOT NULL
  AND closed_store_count IS NOT NULL;
END;
$result_check$;

DROP TABLE public.stg_commercial_store_statistic_import;

COMMIT;
