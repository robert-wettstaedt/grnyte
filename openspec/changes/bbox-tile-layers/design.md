# Design

## Context

Region overlays live in `regions.settings.mapLayers` (jsonb). `entities/region/settings.ts` owns the
stored shape (`mapLayerShape`, read leniently by `storedMapLayerSchema` and strictly by
`exactMapLayerSchema`), the form codec (`wmsUrl`, `mapLayerSchema`, `toLayerForm`), the merge across
a user's regions (`mapLayerKey`, `mergeMapLayers`, `mergeLayerGroup`) and the save fingerprint
(`mapLayersFingerprint`). `readRegionSettings` parses layers one by one: an unknown layer is
dropped and `layersComplete` goes false, which makes the map-layers form refuse to save.

The map builds overlays in `createWmsLayers` (`map/layers.svelte.ts`) as one OpenLayers `TileWMS`
per merged layer, called once from `Map.svelte`'s attachment. `Map.svelte` separately merges the
same layers again for the credits sheet.

Writes: the form submits through `entities/region/writes.ts` to the `updateRegionMapLayers` mutator,
whose server half (`edit.server.ts`) checks the `known` fingerprint and writes through
`settings.server.ts`. Reads come from the region membership the shell already holds (Zero query,
parsed by `entities/region/mapper.ts`). None of that path changes; the widened shape passes through.

## Goals / Non-Goals

**Goals:**

- One new stored layer kind that both OpenLayers today and MapLibre later can draw directly.
- Existing WMS layers, their stored bytes and their form behaviour unchanged.

**Non-Goals:**

- A shared layer abstraction across web and native (native is not built).
- Reworking the form into per-kind fields.

## Decisions

### Remove first

1. `mergeLayerGroup` returns `{ ...first, attributions, minZoom, name, opacity }` instead of
   re-listing `params`, `type: 'wms'` and `url`. With the spread, a merged template keeps its type
   and no merge code learns about kinds.
2. `createWmsLayers` takes the merged `MapLayer[]`; `Map.svelte` merges once and feeds both the
   layers and the credits. One path into the merge instead of two.
3. The credits comments in `base.svelte.ts` (history of what `createWmsLayers` "no longer" does) and
   `layers.svelte.ts` (three lines) shrink to the one fact: region credits are admin HTML and never
   reach OpenLayers.

### Stored shape: a discriminated union on `type`

`mapLayerShape` splits into the shared fields (`attributions`, `minZoom`, `name`, `opacity`) plus
`{ type: 'wms', url, params }` or `{ type: 'template', url }`. Both lenient and strict parses keep
their roles. `mapLayerKey` for a template is its `url` (no params to sort); the WMS key is
unchanged. `mapLayersFingerprint` already covers `type` and `url`, so it needs no change.
Alternative rejected: storing a template as a WMS layer with a sentinel param. It would keep one
shape but make every WMS reader branch on a magic value.

### Form: one field, decided by the placeholder

`wmsUrl` becomes the codec for the whole address: an https address containing `{bbox-epsg-3857}`
decodes to a template; otherwise today's WMS parse runs; anything else is the existing
`form_wmsUrlInvalid` issue with new wording. `URL` parsing is skipped for templates beyond checking
the `https:` prefix, since `new URL` would percent-encode the braces. `toLayerForm` returns the
stored template address unchanged, and `formatWmsUrl` for WMS layers as now. The transform in
`mapLayerSchema` stops hard-coding `type: 'wms'` and takes the kind from the codec.
Alternative rejected: a kind selector in the form. Admins paste one address either way.

### Map: `ImageTile` with a bounding-box URL function

A new exported `bboxTileUrl(template, z, x, y)` in `map/layers.svelte.ts` computes the EPSG:3857
extent of the 256 px XYZ tile and replaces every `{bbox-epsg-3857}`. `createRegionLayers` (renamed
from `createWmsLayers`) builds a `TileLayer` with an `ImageTile` source for template layers, and the
existing `TileWMS` for WMS layers; both share the same layer options (`layerKey`, `layerName`,
`minZoom`, `opacity`, `transition: 0`). The template source gets its own `loader`, which loads each
tile without `crossOrigin`: `ImageTile`'s built-in loader always sets it (`'anonymous'` even when
passed null), so a service without CORS headers would draw blank, while `TileWMS` sends none.
Alternatives rejected: `TileImage` with `tileUrlFunction`, deprecated in OpenLayers 10; `ImageTile`'s
default loader with anonymous CORS, which fails silently on services without CORS headers.

### Maximum zoom: an XYZ grid that ends there

An optional `maxZoom` joins the shared stored fields and the form (one `zoomField` schema serves
minimum and maximum). `createRegionLayers` gives both source types `createXYZ({ maxZoom })` when it is
set, so OpenLayers enlarges the last level instead of requesting deeper tiles; unset keeps today's
sources untouched. Three choices keep it deploy-safe: the form stores the key only when set (a stored
`null` would fail older tabs' strict parse and lock them out of saving), the fingerprint appends it
only when set (unchanged bytes for every existing layer, so older tabs' `known` still matches), and
the merge takes the lowest cap any region set: unlike opacity or a zoom floor, a cap hides only a
service's placeholder, never data, so the strictest costs sharpness at worst. The stored shape accepts
only whole numbers 0 to 28: `createXYZ` throws on anything else, and a throw while the map is built
would blank every map for that region's members, so a bad value drops just its layer instead. A
stored `maxZoom` reaching an older tab is dropped by its lenient parse (it draws uncapped) and marks
the region unwritable there.
Alternative rejected: a cap hard-coded per service host. It would bake third-party behaviour into
code.

### Sync engines

Settings parsing, merging and the map are shared code with no `*.powersync.*` twin, so the change
applies to both builds. The save stays a mutator; no remote function is added.

## Risks / Trade-offs

- [An old tab meets a template layer] It skips it when drawing and its form refuses to save that
  region, as for any unreadable layer. → Accepted; the next reload shows it. Nothing is deleted.
- [Template tiles load without CORS] The browser cannot cache them for offline use or read their
  pixels. → Same as WMS overlays today; neither is cached offline nor read back.
- [The undocumented Oberösterreich service changes or throttles] Its overlay goes blank. → Out of
  this change; it is configured only after DORIS agrees.
- [`{bbox-epsg-3857}` in a non-3857 service] Relief lands in the wrong place. → Visible immediately
  to the admin; no projection check by design.

## Migration Plan

No data migration and no schema change. Deploy order is the usual one (zero-cache, then the app);
the mutator's arguments only widen. Rollback: an older build reading a stored template layer or
`maxZoom` behaves as an old tab does above, so removing them before a rollback is only needed if
admins must keep editing that region's layers.
