-- Transform the June 2026 Seoul commercial-store staging data into `store`.
BEGIN;

INSERT INTO public.store (
  source_store_id,
  business_category_code,
  business_category_name,
  business_subcategory_code,
  business_subcategory_name,
  store_name,
  road_address,
  legal_dong_code,
  geom,
  opened_at,
  closed_at,
  status
)
SELECT
  TRIM(source."상가업소번호"),
  TRIM(source."상권업종중분류코드"),
  LEFT(TRIM(source."상권업종중분류명"), 100),
  NULLIF(TRIM(source."상권업종소분류코드"), ''),
  LEFT(NULLIF(TRIM(source."상권업종소분류명"), ''), 100),
  LEFT(
    NULLIF(
      CONCAT_WS(
        ' ',
        NULLIF(TRIM(source."상호명"), ''),
        NULLIF(TRIM(source."지점명"), '')
      ),
      ''
    ),
    200
  ),
  LEFT(NULLIF(TRIM(source."도로명주소"), ''), 300),
  NULLIF(TRIM(source."법정동코드"), ''),
  source.geom,
  NULL,
  NULL,
  'OPEN'
FROM public.stg_store_import AS source
WHERE source."상가업소번호" IS NOT NULL
  AND TRIM(source."상가업소번호") <> ''
  AND source."상권업종중분류코드" IS NOT NULL
  AND TRIM(source."상권업종중분류코드") <> ''
  AND source."상권업종중분류명" IS NOT NULL
  AND TRIM(source."상권업종중분류명") <> ''
  AND source.geom IS NOT NULL
  AND NOT ST_IsEmpty(source.geom)
  AND ST_SRID(source.geom) = 5186
ON CONFLICT (source_store_id) DO UPDATE
SET
  business_category_code = EXCLUDED.business_category_code,
  business_category_name = EXCLUDED.business_category_name,
  business_subcategory_code = EXCLUDED.business_subcategory_code,
  business_subcategory_name = EXCLUDED.business_subcategory_name,
  store_name = EXCLUDED.store_name,
  road_address = EXCLUDED.road_address,
  legal_dong_code = EXCLUDED.legal_dong_code,
  geom = EXCLUDED.geom,
  status = EXCLUDED.status,
  updated_at = now();

DROP TABLE public.stg_store_import;

COMMIT;
