/**
 * "Area · Block" location breadcrumb for a block-scoped entity (route or ascent
 * row). Drops missing/empty parts so a route with no area still renders cleanly.
 */
export const locationCrumb = (entity: { areaName?: string; blockName?: string }): string[] =>
  [entity.areaName, entity.blockName].filter((name): name is string => name != null && name !== '')
