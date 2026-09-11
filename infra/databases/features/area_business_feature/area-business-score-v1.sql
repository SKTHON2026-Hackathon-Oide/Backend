-- Derive explainable MVP scores from already loaded 2025 statistics.
-- competition_score: percentile of store_count within quarter + CS category;
-- higher means more competing stores.
-- demand_score: percentile of estimated sales per store within quarter + CS
-- category; higher means stronger observed productivity/demand.
BEGIN;
SET LOCAL statement_timeout = 0;

-- Reset derived values so a rerun cannot retain scores for rows that became
-- ineligible after a source refresh.
UPDATE public.area_business_feature
SET competition_score = NULL,
    demand_score = NULL,
    updated_at = now();

WITH competition_input AS (
  SELECT
    feature.id,
    CASE
      WHEN count(*) OVER (
        PARTITION BY feature.base_period, feature.business_category_code
      ) = 1 THEN 50::numeric
      ELSE 100 * percent_rank() OVER (
        PARTITION BY feature.base_period, feature.business_category_code
        ORDER BY feature.store_count NULLS LAST
      )
    END AS score
  FROM public.area_business_feature AS feature
  WHERE feature.store_count IS NOT NULL
), competition_scores AS (
  SELECT id, round(score::numeric, 4)::numeric(8,4) AS score
  FROM competition_input
)
UPDATE public.area_business_feature AS feature
SET competition_score = scores.score,
    updated_at = now()
FROM competition_scores AS scores
WHERE feature.id = scores.id;

WITH demand_input AS (
  SELECT
    feature.id,
    feature.base_period,
    feature.business_category_code,
    sales.estimated_sales_amount /
      NULLIF(feature.store_count, 0)::numeric AS sales_per_store
  FROM public.area_business_feature AS feature
  JOIN public.sales_statistic AS sales
    ON sales.commercial_area_id = feature.commercial_area_id
   AND sales.business_category_code = feature.business_category_code
   AND sales.base_period = feature.base_period
  WHERE feature.store_count > 0
    AND sales.estimated_sales_amount IS NOT NULL
), demand_ranked AS (
  SELECT
    id,
    CASE
      WHEN count(*) OVER (
        PARTITION BY base_period, business_category_code
      ) = 1 THEN 50::numeric
      ELSE 100 * percent_rank() OVER (
        PARTITION BY base_period, business_category_code
        ORDER BY sales_per_store NULLS LAST
      )
    END AS score
  FROM demand_input
), demand_scores AS (
  SELECT id, round(score::numeric, 4)::numeric(8,4) AS score
  FROM demand_ranked
)
UPDATE public.area_business_feature AS feature
SET demand_score = scores.score,
    updated_at = now()
FROM demand_scores AS scores
WHERE feature.id = scores.id;

DO $result_check$
DECLARE
  invalid_score_count bigint;
  competition_count bigint;
  demand_count bigint;
BEGIN
  SELECT count(*) INTO invalid_score_count
  FROM public.area_business_feature
  WHERE competition_score IS NOT NULL
    AND (competition_score < 0 OR competition_score > 100)
     OR demand_score IS NOT NULL
    AND (demand_score < 0 OR demand_score > 100);

  SELECT count(*) INTO competition_count
  FROM public.area_business_feature
  WHERE store_count IS NOT NULL AND competition_score IS NOT NULL;

  SELECT count(*) INTO demand_count
  FROM public.area_business_feature
  WHERE demand_score IS NOT NULL;

  IF invalid_score_count > 0 THEN
    RAISE EXCEPTION 'Feature score range validation failed for % rows.', invalid_score_count;
  END IF;

  RAISE NOTICE 'Calculated competition scores for % rows and demand scores for % rows.',
    competition_count, demand_count;
END;
$result_check$;

COMMIT;
