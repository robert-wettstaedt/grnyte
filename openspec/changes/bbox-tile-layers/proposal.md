# Proposal

## Why

A region's relief overlay must be a WMS today, and two state relief services only answer as ArcGIS
REST `export` / `exportImage` calls (Land Salzburg's 1 m hillshade, Land Oberösterreich's 0.5 m
terrain model). Both take the map extent as a bounding box in the address, are transparent outside
their state and send open CORS headers, so a "tile address with a bounding-box placeholder" covers
them without a server of our own.

Relief stays on state services only: every one of them is transparent outside its state, so a user
who belongs to regions in several states never sees two shadings stacked. Nationwide basemap.at was
rejected for that reason: it is opaque, reaches into southern Bavaria and would darken twice over
the Bayern and Tirol services. The same address format is what MapLibre (the planned native map)
reads natively, so the stored shape serves both apps.

## What Changes

- A map layer can be stored as `type: 'template'`: one https address containing
  `{bbox-epsg-3857}`, which the map fills with each 256 px tile's EPSG:3857 bounding box.
- The map-layers form keeps its single "Request URL" field. A plain WMS address with `LAYERS` is
  stored as a `wms` layer exactly as today; an address containing `{bbox-epsg-3857}` becomes a
  `template` layer. The field's hint and error text say so, in English and German.
- The web map draws template layers beside WMS ones, with the same name, opacity, minimum zoom,
  credits and layer-switcher row.
- Identical template layers in several of a user's regions fold into one, as WMS layers do.
- Any layer can get an optional maximum zoom. Past it the map enlarges that zoom's tiles instead of
  requesting new ones: Salzburg's service answers zoom 16 and closer with a grey placeholder grid.
  Stored only when set, so uncapped layers and their save fingerprints stay byte-identical.
- Before building: the merge of duplicate layers stops re-listing their fields, the map merges the
  region layers once for both drawing and credits, and two comments shrink.
- Not breaking: the stored shape only widens. Already-open tabs skip a template layer when drawing,
  and their map-layers form refuses to save that region (the existing unreadable-layers guard), so
  nothing is deleted. The save mutator's arguments only widen. No database schema change.

## Non-goals

- Configuring Salzburg or Oberösterreich layers: that waits for written permission from SAGIS and
  DORIS; this change only makes it possible.
- `{z}/{x}/{y}` tile services (no configured source needs them).
- basemap.at, relief for Kärnten, Niederösterreich, Wien and Burgenland, stacking or compositing
  overlapping layers, clipping layers to a state outline.
- Any server endpoint, tile proxy or pre-rendered tiles.
- The native app: nothing is built for it here.
- A per-layer tile size, or checking the address's projection.

## Capabilities

### New Capabilities

- `map/region-layers`: overlays a region admin configures for the map (WMS and bounding-box
  template addresses), how the form accepts them, how they are stored, merged across a user's
  regions and drawn.

### Modified Capabilities

_(none)_

## Impact

- Entity module `src/lib/entities/region/`: `settings.ts` (stored and form schemas, merge, form
  seed), `edit.server.ts` (save handler, unchanged logic, new shape passes through), tests
  `settings.test.ts`, `mapLayers.server.test.ts`.
- Map: `src/lib/map/layers.svelte.ts` (`createWmsLayers`), `src/lib/map/Map.svelte`,
  `src/lib/map/base.svelte.ts` (comment), tests `layers.svelte.test.ts`.
- Route: `src/routes/(app)/regions/[regionId]/map-layers/+page.svelte` (copy only).
- Messages: `region_mapLayerUrlHint`, `form_wmsUrlInvalid` text in `messages/en.json` and
  `messages/de.json`.
- Table: `regions.settings` (jsonb), written only through `entities/region/settings.server.ts`.
- No dependency added; OpenLayers 10.10 `ImageTile` source is already installed.
