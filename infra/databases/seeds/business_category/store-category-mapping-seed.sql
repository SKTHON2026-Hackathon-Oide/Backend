-- Preserve source store classifications and provide only high-confidence
-- mappings to the canonical CS taxonomy. Unmapped rows remain REVIEW/NULL and
-- can be reviewed without corrupting the source code.
BEGIN;

INSERT INTO public.store_category_mapping (
  source_subcategory_code,
  source_subcategory_name,
  business_category_code,
  mapping_status,
  mapping_note,
  updated_at
)
SELECT DISTINCT
  store.business_subcategory_code,
  store.business_subcategory_name,
  CASE
    WHEN store.business_subcategory_code LIKE 'I201%' THEN 'CS100001'
    WHEN store.business_subcategory_code LIKE 'I202%' THEN 'CS100002'
    WHEN store.business_subcategory_code LIKE 'I211%' THEN 'CS100009'
    WHEN store.business_subcategory_code LIKE 'I212%' THEN 'CS100010'
    ELSE NULL
  END,
  CASE
    WHEN store.business_subcategory_code LIKE ANY (ARRAY['I201%', 'I202%', 'I211%', 'I212%'])
      THEN 'CONFIRMED'
    ELSE 'REVIEW'
  END,
  CASE
    WHEN store.business_subcategory_code LIKE 'I201%' THEN '소상공인 한식 중분류를 서울시 한식음식점으로 매핑'
    WHEN store.business_subcategory_code LIKE 'I202%' THEN '소상공인 중식 중분류를 서울시 중식음식점으로 매핑'
    WHEN store.business_subcategory_code LIKE 'I211%' THEN '소상공인 주점 중분류를 서울시 호프-간이주점으로 매핑'
    WHEN store.business_subcategory_code LIKE 'I212%' THEN '소상공인 비알코올 중분류를 서울시 커피-음료로 매핑'
    ELSE '원본 분류와 서울시 CS 분류의 대응 관계를 수동 검토'
  END,
  now()
FROM public.store AS store
WHERE NULLIF(btrim(store.business_subcategory_code), '') IS NOT NULL
ON CONFLICT (source_subcategory_code) DO UPDATE
SET source_subcategory_name = EXCLUDED.source_subcategory_name,
    business_category_code = EXCLUDED.business_category_code,
    mapping_status = EXCLUDED.mapping_status,
    mapping_note = EXCLUDED.mapping_note,
    updated_at = now();

UPDATE public.store AS store
SET service_business_category_code = mapping.business_category_code,
    updated_at = now()
FROM public.store_category_mapping AS mapping
WHERE mapping.source_subcategory_code = store.business_subcategory_code
  AND mapping.mapping_status = 'CONFIRMED';

DO $validation$
DECLARE
  mapping_count bigint;
  invalid_mapping_count bigint;
BEGIN
  SELECT count(*) INTO mapping_count
  FROM public.store_category_mapping;

  IF mapping_count = 0 THEN
    RAISE EXCEPTION 'No source store subcategory mappings were created.';
  END IF;

  SELECT count(*) INTO invalid_mapping_count
  FROM public.store_category_mapping AS mapping
  LEFT JOIN public.business_category AS category
    ON category.code = mapping.business_category_code
  WHERE mapping.business_category_code IS NOT NULL
    AND category.code IS NULL;

  IF invalid_mapping_count > 0 THEN
    RAISE EXCEPTION 'Found % mappings to unknown canonical categories.', invalid_mapping_count;
  END IF;
END;
$validation$;

COMMIT;
