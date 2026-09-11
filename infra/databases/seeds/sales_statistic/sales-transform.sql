-- Seoul commercial-area estimated sales (2025) -> public.sales_statistic
-- Run sales-staging.sql first.

BEGIN;

DO $validation$
DECLARE
  source_count bigint;
  invalid_count bigint;
  unmatched_area_count bigint;
BEGIN
  IF to_regclass('public.stg_sales_statistic_import') IS NULL THEN
    RAISE EXCEPTION
      'public.stg_sales_statistic_import does not exist. Run sales-staging.sql first.';
  END IF;

  SELECT count(*)
    INTO source_count
    FROM public.stg_sales_statistic_import;

  IF source_count <> 85732 THEN
    RAISE EXCEPTION
      'Unexpected staging row count: % (expected 85732).', source_count;
  END IF;

  SELECT count(*)
    INTO invalid_count
    FROM public.stg_sales_statistic_import
   WHERE btrim("기준_년분기_코드") !~ '^2025[1-4]$'
      OR nullif(btrim("상권_코드"), '') IS NULL
      OR nullif(btrim("서비스_업종_코드"), '') IS NULL
      OR btrim("당월_매출_금액") !~ '^[0-9]+$'
      OR btrim("당월_매출_건수") !~ '^[0-9]+$';

  IF invalid_count > 0 THEN
    RAISE EXCEPTION
      'Staging contains % rows with invalid keys or numeric values.', invalid_count;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.stg_sales_statistic_import
     GROUP BY
       btrim("기준_년분기_코드"),
       btrim("상권_코드"),
       btrim("서비스_업종_코드")
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Staging contains duplicate period, commercial-area, and business-category keys.';
  END IF;

  SELECT count(DISTINCT btrim(source."상권_코드"))
    INTO unmatched_area_count
    FROM public.stg_sales_statistic_import AS source
    LEFT JOIN public.commercial_area AS area
      ON area.commercial_area_code = btrim(source."상권_코드")
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
    btrim(source."서비스_업종_코드") AS business_category_code,
    make_date(
      left(btrim(source."기준_년분기_코드"), 4)::integer,
      ((right(btrim(source."기준_년분기_코드"), 1)::integer - 1) * 3) + 1,
      1
    ) AS base_period,
    btrim(source."당월_매출_금액")::numeric(18, 2) AS estimated_sales_amount,
    btrim(source."당월_매출_건수")::bigint AS transaction_count
  FROM public.stg_sales_statistic_import AS source
  JOIN public.commercial_area AS area
    ON area.commercial_area_code = btrim(source."상권_코드")
)
INSERT INTO public.sales_statistic (
  commercial_area_id,
  business_category_code,
  base_period,
  estimated_sales_amount,
  transaction_count,
  average_transaction_amount,
  store_count,
  closed_store_count,
  created_at,
  updated_at
)
SELECT
  commercial_area_id,
  business_category_code,
  base_period,
  estimated_sales_amount,
  transaction_count,
  round(
    estimated_sales_amount / nullif(transaction_count, 0),
    2
  )::numeric(18, 2) AS average_transaction_amount,
  NULL::integer AS store_count,
  NULL::integer AS closed_store_count,
  now() AS created_at,
  now() AS updated_at
FROM normalized
ON CONFLICT (commercial_area_id, business_category_code, base_period) DO UPDATE
SET estimated_sales_amount = EXCLUDED.estimated_sales_amount,
    transaction_count = EXCLUDED.transaction_count,
    average_transaction_amount = EXCLUDED.average_transaction_amount,
    store_count = EXCLUDED.store_count,
    closed_store_count = EXCLUDED.closed_store_count,
    updated_at = now();

DO $result_check$
DECLARE
  imported_count bigint;
BEGIN
  SELECT count(*)
    INTO imported_count
    FROM public.stg_sales_statistic_import AS source
    JOIN public.commercial_area AS area
      ON area.commercial_area_code = btrim(source."상권_코드")
    JOIN public.sales_statistic AS statistic
      ON statistic.commercial_area_id = area.id
     AND statistic.business_category_code = btrim(source."서비스_업종_코드")
     AND statistic.base_period = make_date(
       left(btrim(source."기준_년분기_코드"), 4)::integer,
       ((right(btrim(source."기준_년분기_코드"), 1)::integer - 1) * 3) + 1,
       1
     );

  IF imported_count <> 85732 THEN
    RAISE EXCEPTION
      'Sales import verification failed: % rows found (expected 85732).',
      imported_count;
  END IF;
END;
$result_check$;

DROP TABLE public.stg_sales_statistic_import;

COMMIT;
