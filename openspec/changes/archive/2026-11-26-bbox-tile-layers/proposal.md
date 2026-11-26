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

Two problems surfaced while testing six state layers together. From zoom 15 on, every layer
requests its tiles everywhere on screen, and most come back as transparent images: small each, but
they add up on every pan. And the map-layers page is one long form holding every layer's fields at
once, with no way to see what an address draws before saving it to the live map.

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
- A layer can store its coverage, a lon/lat rectangle, and the map requests no tiles of that layer
  outside it. The coverage is read from the service itself: a WMS from its capabilities, an ArcGIS
  `export` / `exportImage` template from the service's extent. Only when the service gives none
  does the admin type it. Stored only when set, like the maximum zoom. Existing layers get theirs
  the next time an admin opens and saves them.
- The map-layers page becomes a list with one page per layer. Each row shows a small image of the
  layer's whole coverage, its name, a WMS or Template badge and the zoom it shows from. A row opens
  `/regions/[id]/map-layers/[layer]` (a short hash of the layer's address), and "Add layer" opens
  `/regions/[id]/map-layers/add`. That page holds one layer's form and a live preview of only that
  layer, framed on its coverage. "Remove layer" asks first, then saves at once. The maximum zoom
  moves into a closed section named after its symptom ("Shows a placeholder when zoomed in?").
  Saving still sends the whole list through the same mutator and stale-write guard, then returns
  to the list.
- Before building: the merge of duplicate layers stops re-listing their fields, the map merges the
  region layers once for both drawing and credits, and two comments shrink. The redesign then
  deletes the multi-row form instead of keeping it beside the new pages.
- Not breaking: the stored shape only widens. Already-open tabs skip a template layer when drawing,
  and their map-layers form refuses to save that region (the existing unreadable-layers guard), so
  nothing is deleted. The save mutator's arguments only widen. No database schema change.
  `/regions/[id]/map-layers` keeps its address and only gains child routes, so an open tab on the
  old form keeps working until it reloads.

## Non-goals

- Configuring Salzburg or Oberösterreich layers: that waits for written permission from SAGIS and
  DORIS; this change only makes it possible.
- `{z}/{x}/{y}` tile services (no configured source needs them).
- basemap.at, relief for Kärnten, Niederösterreich, Wien and Burgenland, stacking or compositing
  overlapping layers, clipping layers to a state outline.
- Any server endpoint, tile proxy or pre-rendered tiles.
- The native app: nothing is built for it here.
- A per-layer tile size, or checking the address's projection.
- Reordering layers, a bulk "read coverage for all layers" action, a stored id per layer.
- The map reading a service's capabilities while drawing: coverage is read only on the layer's
  page and stored with the layer.

## Capabilities

### New Capabilities

- `map/region-layers`: overlays a region admin configures for the map (WMS and bounding-box
  template addresses), how the admin pages list and edit them, how they are stored with their
  coverage, merged across a user's regions and drawn.

### Modified Capabilities

_(none)_

## Impact

- Entity module `src/lib/entities/region/`: `settings.ts` (stored and form schemas, merge, form
  seed), `edit.server.ts` (save handler, unchanged logic, new shape passes through), tests
  `settings.test.ts`, `mapLayers.server.test.ts`.
- Map: `src/lib/map/layers.svelte.ts` (`createRegionLayers`, formerly `createWmsLayers`), `src/lib/map/Map.svelte`,
  `src/lib/map/base.svelte.ts` (comment), tests `layers.svelte.test.ts`.
- Coverage reading: a new client module in `src/lib/entities/region/` (WMS capabilities and ArcGIS
  extent), with its tests.
- Routes under `src/routes/(app)/regions/[regionId]/map-layers/`: `+page.svelte` becomes the list;
  new `[layer]/+page.svelte` and `add/+page.svelte` share one layer form and a preview map built
  with `createBaseMap`.
- Messages: `region_mapLayerUrlHint`, `form_wmsUrlInvalid` text, the maximum and minimum zoom
  labels and hints, and new keys for the list, coverage, disclosure, preview and remove dialog, in
  `messages/en.json` and `messages/de.json`.
- Table: `regions.settings` (jsonb), written only through `entities/region/settings.server.ts`.
- No dependency added; OpenLayers 10.10 `ImageTile` source is already installed.
