-- Custom SQL migration file, put your code below! --

-- Collapse the 3-value area type (area | crag | sector) to two roles (area | crag):
--   * former `sector` (the block holder) -> `crag` (the climbing spot shown on the map)
--   * former `crag` / `area` (groupings)  -> `area` (an organizational folder)
-- Single CASE expression so the order is irrelevant (a sequential sector->crag then
-- crag->area would wrongly re-convert the just-made crags).
UPDATE "areas" SET "type" = CASE WHEN "type" = 'sector' THEN 'crag' ELSE 'area' END;
