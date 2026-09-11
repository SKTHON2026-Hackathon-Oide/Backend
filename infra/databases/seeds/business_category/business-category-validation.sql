SELECT
  (SELECT count(*) FROM public.business_category) AS canonical_category_count,
  (SELECT count(*) FROM public.business_category_analysis_profile
   WHERE is_active) AS active_analysis_profile_count,
  (SELECT count(*) FROM public.store_category_mapping) AS source_mapping_count,
  (SELECT count(*) FROM public.store WHERE service_business_category_code IS NOT NULL)
    AS normalized_store_count,
  (SELECT count(*)
   FROM public.area_business_feature AS feature
   LEFT JOIN public.business_category AS category
     ON category.code = feature.business_category_code
   WHERE category.code IS NULL) AS feature_unknown_category_count,
  (SELECT count(*)
   FROM public.sales_statistic AS sales
   LEFT JOIN public.business_category AS category
     ON category.code = sales.business_category_code
   WHERE category.code IS NULL) AS sales_unknown_category_count;
