SELECT
  count(*) AS feature_count,
  count(*) FILTER (WHERE competition_score IS NOT NULL) AS competition_scored_count,
  count(*) FILTER (WHERE demand_score IS NOT NULL) AS demand_scored_count,
  count(*) FILTER (WHERE competition_score < 0 OR competition_score > 100)
    AS invalid_competition_score_count,
  count(*) FILTER (WHERE demand_score < 0 OR demand_score > 100)
    AS invalid_demand_score_count,
  min(competition_score) AS min_competition_score,
  max(competition_score) AS max_competition_score,
  min(demand_score) AS min_demand_score,
  max(demand_score) AS max_demand_score
FROM public.area_business_feature;

SELECT
  base_period,
  count(*) AS feature_count,
  count(*) FILTER (WHERE competition_score IS NOT NULL) AS competition_scored_count,
  count(*) FILTER (WHERE demand_score IS NOT NULL) AS demand_scored_count
FROM public.area_business_feature
GROUP BY base_period
ORDER BY base_period;
