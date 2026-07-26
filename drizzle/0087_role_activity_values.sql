-- v1 logged role changes as display labels ('Admin'), v2 logs the enum value ('region_admin').
-- Rewrite the old rows so the activity feed renders one vocabulary.
UPDATE "activities"
SET
  "old_value" = CASE "old_value"
    WHEN 'App Admin' THEN 'app_admin'
    WHEN 'Admin' THEN 'region_admin'
    WHEN 'Maintainer' THEN 'region_maintainer'
    WHEN 'User' THEN 'region_user'
    ELSE "old_value"
  END,
  "new_value" = CASE "new_value"
    WHEN 'App Admin' THEN 'app_admin'
    WHEN 'Admin' THEN 'region_admin'
    WHEN 'Maintainer' THEN 'region_maintainer'
    WHEN 'User' THEN 'region_user'
    ELSE "new_value"
  END
WHERE
  "column_name" = 'role'
  AND "entity_type" = 'user'
  AND (
    "old_value" IN ('App Admin', 'Admin', 'Maintainer', 'User')
    OR "new_value" IN ('App Admin', 'Admin', 'Maintainer', 'User')
  );
