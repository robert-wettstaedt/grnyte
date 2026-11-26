# Design

## Context

Groups 1 to 9 of the tasks are built; this section describes the code as it stands after them, with
the names they replaced in brackets.

Region overlays live in `regions.settings.mapLayers` (jsonb). `entities/region/settings.ts` owns the
stored shape (`sharedShape` plus `wmsShape` / `templateShape`, formerly one `mapLayerShape`, read
leniently by `storedMapLayerSchema` and strictly by `exactMapLayerSchema`), the form codec
(`layerUrl`, formerly `wmsUrl`; `zoomField`, `mapLayerSchema`, `toLayerForm`), the merge across a
user's regions (`mapLayerKey`, `mergeMapLayers`, `mergeLayerGroup`, `mergedCap`) and the save
fingerprint (`mapLayersFingerprint`). `readRegionSettings` parses layers one by one: an unknown
layer is dropped and `layersComplete` goes false, which makes the map-layers form refuse to save.
The strict stored shape is looser than the form: it accepts any `name`, `opacity` and `minZoom`
number, where the form wants a name of 3 or more characters, opacity 0 to 1 and a whole zoom.

The map builds overlays in `createRegionLayers` (formerly `createWmsLayers`, `map/layers.svelte.ts`):
one `TileWMS` or `ImageTile` layer per merged layer, from the list `Map.svelte` merges once for both
the layers and the credits sheet.

Writes: the form submits through `entities/region/writes.ts` to the `updateRegionMapLayers` mutator,
whose server half (`edit.server.ts`) checks the `known` fingerprint and writes through
`settings.server.ts`. Reads come from the region membership the shell already holds (Zero query,
parsed by `entities/region/mapper.ts`). None of that path changes; the widened shape passes through.

The page `regions/[regionId]/map-layers/+page.svelte` is one `Form` over `regionMapLayersSchema`
(`id`, `known`, `mapLayers[]`) with a `fieldRows` block per layer. It seeds from the membership only
once the region row is synced and `layersComplete` holds, because an empty or partial list is a
valid submission that deletes layers. Stored layers carry no id; the list is saved whole.

## Goals / Non-Goals

**Goals:**

- One new stored layer kind that both OpenLayers today and MapLibre later can draw directly.
- Existing WMS layers and their stored bytes unchanged.
- No tile requests outside a layer's ground, with the ground read from the service, not typed.
- One layer per page, with a preview, without a new write path.

**Non-Goals:**

- A shared layer abstraction across web and native (native is not built).
- Reworking the form into per-kind fields.
- Following the design canvas's page chrome: header, back link, Save and Cancel and page width
  come from `Form`, `RegionScreen` and `PageHeader`. The canvas sets content and layout only.

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

### Coverage: a stored `bounds` rectangle that becomes the layer's extent

An optional `bounds: [west, south, east, north]` in degrees joins the shared stored fields. The
name and order match MapLibre's raster source `bounds`, so the native app can pass it straight
through. Same deploy-safe rules as `maxZoom`: stored and fingerprinted only when set, a value that
is not four finite numbers with west < east, south < north, |lon| <= 180 and |lat| <= 85.0511 drops
only its layer (an extent OpenLayers cannot project would break the map build). One check,
`isValidBounds`, serves the stored shape, the form codec and `readCoverage`, as `maxZoom`'s 0 to 28
does on both sides: a rule only the stored read knew would let the form save a layer that then reads
as unknown, which locks the region's map layers against every later save. The merge takes the
union of the duplicates' rectangles, and none at all when any duplicate has none: a missing coverage
means "everywhere", and narrowing it would hide relief another region relies on.
`createRegionLayers` sets the `TileLayer`'s `extent` to the rectangle transformed to EPSG:3857, which
stops OpenLayers requesting tiles outside it for both source types. The form carries it as one
string field `west,south,east,north` (empty = none), decoded and encoded by the layer schema like the
zooms.
Alternatives rejected: a per-app lookup of the capabilities at draw time (every member's map would
fetch capabilities from every service); clipping to the state outline (a polygon, which MapLibre
cannot mask a raster with).

### Reading coverage from the service

A client-only module in `entities/region/` exposes `readCoverage(layer, fetch, signal)`, returning
the rectangle or `null`, never throwing. `fetch` is injected so tests replay recorded answers.

- WMS: `GetCapabilities` (`SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0`) on the layer's
  endpoint, parsed with `DOMParser`. For each name in `LAYERS`, the `<Layer>` with that `<Name>`, its
  `EX_GeographicBoundingBox`, else its nearest ancestor's. Several names are joined into one
  rectangle; a missing name gives `null`.
- ArcGIS template: only when the template's path ends in `MapServer/export` or
  `ImageServer/exportImage`. The service root plus `?f=json` gives `fullExtent` (or `extent`) and
  its `spatialReference`, in a projected system (EPSG:31258 for Salzburg, 31255 for Oberösterreich).
  The browser has no projection library for those, so the server converts: `export` /
  `exportImage` with that box, `bboxSR=<wkid>`, `imageSR=4326` and `f=json` answers the extent in
  degrees. The server stretches that answer to the requested image's shape, so the module asks twice,
  once very wide and once very tall, and takes the longitudes from the tall answer and the latitudes
  from the wide one.
- Anything else, a network or CORS failure, or an 8 second timeout gives `null`.
- The answer is clamped to latitudes within 85.0511 (WMS boxes often say 90) and must then pass
  `isValidBounds`, else `null`. So a read value can never fail the form's own check.

Requests go out with `credentials: 'omit'` and `referrerPolicy: 'no-referrer'`, and the second
ArcGIS query is built with `URLSearchParams`, never by joining the service's own JSON into a string.

The read result lives in page state, outside the form store, so it never counts as an edit and
`seedFollowingRows` keeps following newer stored rows after a reload. The page reads on open and
again about half a second after the address stops changing, aborting the previous read:

- While reading, the coverage section shows the stored rectangle (or a "reading" line) at the
  height of the read-only display, so the fields below do not move when the answer lands.
- A result shows read-only, with its outline on the preview. On submit (`onBeforeSubmit`) the page
  writes it into the form's coverage field, so Save stores the service's current answer.
- Changing the address clears the coverage field at once: the old rectangle belongs to the old
  service, and saving it with the new address would hide relief outside it. A Save pressed while a
  read is pending waits for it (at most its 8 s timeout) before writing.
- `null` shows the note and the editable field, seeded with the stored rectangle if there is one, so
  a typed coverage stays editable.

Every relief service configured today answers these requests with CORS headers for the app's
origin.

### Pages: one form store, one visible layer

The list (`map-layers/+page.svelte`) reads the membership's layers directly; it has no form. The
layer's page (`map-layers/[layer]/+page.svelte`) and `map-layers/add/+page.svelte` share one new
component, `map-layers/LayerForm.svelte`. It keeps today's form: `regionMapLayersSchema` seeded with
the whole stored list and the `known` fingerprint through `seedFollowingRows`, under the same synced
and `layersComplete` gates, but it renders the fields of one row only. "Add" appends a blank row and
shows it. So the save path, its handler and its stale-write guard stay exactly as they are; this is
the whole point of not adding per-layer mutators.

Hidden rows: the strict stored shape is looser than the form (see Context), so another layer's
stored value can fail the form's check on a row that is not rendered. The form store cannot say
which: `validate` files an issue under the nearest rendered field, so a hidden row's issue arrives
at form level with an empty path. So the page checks the other rows itself, running each seeded
row through `mapLayerSchema.safeParse`, and shows a notice above the form naming each failing layer
with a link to its page. Save is refused while the notice shows.

Row identity: the page maps its segment to a row index once per seed, against the rows it seeded,
never against form values (typing the address would flip the page to "not found") nor against the
live stored list (it moves on while an edited form does not re-seed).

Duplicates: two stored rows with the same `mapLayerKey` would share one segment, so the second could
never be opened. The layer form refuses an address another row of the region already has (a field
error, checked in the page before submit, not in `regionMapLayersSchema`, whose arguments only
widen). Rows already stored twice keep working on the map; the list links both to the first, whose
page then cannot save until one is removed, so the error says to remove the duplicate.

Navigation: saving leaves the page like every form here (`Form` exits after a successful submit). A
new write wrapper beside `updateRegionMapLayers` in `writes.ts` sends the same mutator with
`redirectTo` the list instead of the region, so Save, Add and Remove all land on the list. Staying on
the page is not an option: after a save the form counts as edited, `seedFollowingRows` would not
re-seed `known`, and a second save would be refused as stale. "Remove layer" opens the app's
`Dialog` confirmation (the centred card every settings screen uses to remove something); confirming
closes the dialog, drops the row, sets a `removing` flag and submits through `Form`
(`requestSubmit`), so `Form`'s exit to the list runs as for Save. `onBeforeSubmit` skips the
coverage write while `removing`: the shown row's index now holds the next layer.

The segment is `fingerprint(mapLayerKey(layer))` from `$lib/forms/fingerprint`, the one hash
function; `mapLayerKey`'s comment ("never stored and never posted") gains that it now also names a
URL segment. A segment matching no stored layer shows `ErrorState` (`notfound`) with a link to the
list.

Layout from the approved design: Name, Address (hint unchanged), Coverage (read-only numbers, or the
note and field), then Opacity beside "Show from zoom" (the stored `minZoom`, hint "Hidden further
out"), then Credits. The maximum zoom, labelled "Detail ends at zoom", sits in a `Disclosure` titled
"Shows a placeholder when zoomed in?", open when a cap is stored or the field has an error. Its label
and hint change because the two zooms do different things: the minimum hides the layer, the maximum
enlarges past the end of the service's data. Remove layer sits last. `Form` caps its column at
`max-w-screen-sm` unless `fill` is set, so the layer page sets `fill` and lays out its own columns:
on desktop the form column beside a large preview, on the phone the preview above the form. The
header and Save and Cancel stay `Form`'s.

### Preview and row images

The preview is a small Svelte component on `createBaseMap` with `extraLayers` from
`createRegionLayers([layer])`, so it draws through exactly the map's code path. It parses the form
value with the layer schema; an invalid value keeps the last good preview. A change rebuilds the
overlay 500 ms after edits stop. Framing: the coverage; else `contentExtent` of the region's located
blocks (`blockMapList`, the read `Map.svelte` uses for every region, filtered to this region by
`regionFk`; it has a PowerSync twin); else the default view. The coverage outline is a small vector
layer holding the rectangle, dashed in the accent colour. The preview drops the layer's `minZoom`:
framed on a whole state it sits near zoom 7, far below a typical "show from zoom", and would draw
nothing.

Each list row shows one `<img>` from `coverageImageUrl(layer, width, height)` in
`entities/region/coverage.ts`: for WMS, a `GetMap` with the coverage in EPSG:3857 as `BBOX` and the
image size; for a template, the placeholder filled with the same box (the template's own size
stays, and ArcGIS pads to it, so the image is drawn with `object-fit: contain`). Plain `<img>`,
lazy, no `crossOrigin`, like the tiles. No coverage: a neutral placeholder and no request. WMS
images are requested at 512 px for the 52 px slot: the Bayern service draws nothing for the whole
state at 384 px or less (measured), and without CORS the page cannot see that an image is empty.

### Sync engines

Settings parsing, merging and the map are shared code with no `*.powersync.*` twin, so the change
applies to both builds. The save stays a mutator; no remote function is added. The preview's block
read is new on these pages and has a twin, so the pages are checked on both builds (task 13.4).

## Risks / Trade-offs

- [An old tab meets a template layer] It skips it when drawing and its form refuses to save that
  region, as for any unreadable layer. → Accepted; the next reload shows it. Nothing is deleted.
- [Template tiles load without CORS] The browser cannot cache them for offline use or read their
  pixels. → Same as WMS overlays today; neither is cached offline nor read back.
- [The undocumented Oberösterreich service changes or throttles] Its overlay goes blank. → Out of
  this change; it is configured only after DORIS agrees.
- [`{bbox-epsg-3857}` in a non-3857 service] Relief lands in the wrong place. → Visible immediately
  to the admin; no projection check by design.
- [ArcGIS stretches its answer differently than assumed] The coverage comes out too large. → Too
  large only costs a few transparent tiles, never hides relief; task 11.3 checks both live services.
- [A service draws nothing at thumbnail scale] That row's image is empty. → Cosmetic; the layer's
  page and the map are unaffected.
- [A hidden row fails validation] Another layer's stored value is valid for the stored shape but
  not for the form, so the save is refused. → The hidden-rows notice names that layer and links to
  its page, where the field shows its error.
- [Saving no longer returns to the region] Save, Add and Remove land on the map-layers list instead
  of the region page. → Intended: the list is where the admin continues.
- [Old tab meets stored `bounds`] It draws the layer everywhere and refuses to save that region, as
  with `maxZoom`. Old tabs on the old `/map-layers` page keep working until reload; no route is
  removed.

## Migration Plan

No data migration and no schema change. Deploy order is the usual one (zero-cache, then the app);
the mutator's arguments only widen. Existing layers gain coverage one by one as admins open and
save them; nothing backfills. Rollback: an older build reading a stored template layer, `maxZoom`
or `bounds` behaves as an old tab does above, so removing them before a rollback is only needed if
admins must keep editing that region's layers.
