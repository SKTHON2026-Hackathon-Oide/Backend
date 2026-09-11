SELECT
  count(*) AS link_count,
  count(DISTINCT commercial_area_id) AS linked_area_count,
  count(DISTINCT building_id) AS linked_building_count,
  min(overlap_ratio) AS min_overlap_ratio,
  max(overlap_ratio) AS max_overlap_ratio,
  count(*) FILTER (WHERE overlap_ratio = 1.00000) AS full_overlap_count
FROM public.commercial_area_building;

SELECT
  count(*) AS orphan_link_count
FROM public.commercial_area_building AS link
LEFT JOIN public.commercial_area AS area
  ON area.id = link.commercial_area_id
LEFT JOIN public.building
  ON building.id = link.building_id
WHERE area.id IS NULL OR building.id IS NULL;
