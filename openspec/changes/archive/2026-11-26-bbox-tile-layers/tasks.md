# Tasks

Each numbered test task is one red to green slice: write the test, see it fail for the stated
reason, write only enough code to pass. Tests live only at the agreed seams: `readRegionSettings`,
`mapLayerSchema` / `toLayerForm`, `mergeMapLayers`, `bboxTileUrl`, `createRegionLayers`, the save
handler, and for groups 10 to 13 also `readCoverage` (injected `fetch`) and `coverageImageUrl`.
Pages are verified by driving, not by component tests.

## 1. Remove before building

- [x] 1.1 `mergeLayerGroup` (`entities/region/settings.ts`) returns `{ ...first, attributions,
minZoom, name, opacity }` instead of re-listing `params`, `type`, `url`. Verify:
      `npx vitest run src/lib/entities/region/settings.test.ts` stays green.
- [x] 1.2 `createWmsLayers` (`map/layers.svelte.ts`) takes the merged `MapLayer[]`; `Map.svelte`
      merges once and feeds both the layers and `creditStrings`. Verify: the map tests stay green and
      the Test region still shows Bayern and Tirol relief and their credits on a block map.
- [x] 1.3 Shrink the credits comments in `map/base.svelte.ts` and `map/layers.svelte.ts` to one or
      two lines each. Verify: `git diff` touches comments only.

## 2. Stored shape (seam: `readRegionSettings`)

- [x] 2.1 Red: a stored `{ type: 'template', url: '...{bbox-epsg-3857}...', name, ... }` layer reads
      back whole with `layersComplete: true`, beside a WMS layer. Green: split `mapLayerShape` into a
      discriminated union on `type` for both the lenient and the strict schema. Verify: the test failed
      on the dropped layer first, then passes.
- [x] 2.2 `mapLayerKey` keys a template layer by its `url`. Covered by 4.1; no separate test.

## 3. Form (seam: `mapLayerSchema` / `toLayerForm`)

- [x] 3.1 Red: `https://service.example/export?bbox={bbox-epsg-3857}&f=image` decodes to a template
      layer with exactly that address. Green: the codec recognises the placeholder before the WMS parse,
      and the transform takes `type` from the codec. Verify: red on the WMS-only error, then green.
- [x] 3.2 Red: `http://` with the placeholder, and an address with neither `LAYERS` nor the
      placeholder, both give `form_wmsUrlInvalid`. Green as needed. Verify: the existing WMS cases in
      `settings.test.ts` stay green.
- [x] 3.3 Red: `toLayerForm` of a stored template returns the stored address unchanged (no
      percent-encoded braces). Green: return `url` for templates. Verify: red then green.

## 4. Merge (seam: `mergeMapLayers`)

- [x] 4.1 Red: two regions holding the same template address merge into one layer whose `type` is
      `'template'`; two different template addresses stay two. Green: `mapLayerKey` for templates.
      Verify: red then green, and 1.1's spread keeps the type without further change.

## 5. Map (seam: `bboxTileUrl`)

- [x] 5.1 Red: `bboxTileUrl('a?b={bbox-epsg-3857}', 1, 0, 0)` returns
      `a?b=-20037508.342789244,0,0,20037508.342789244`, and a template with the placeholder twice has
      both replaced. Expected values are hand-worked, not recomputed. Green: the exported function.
- [x] 5.2 `createRegionLayers` (renamed from `createWmsLayers`) builds an `ImageTile` source for
      template layers whose `loader` fetches `bboxTileUrl(...)` without `crossOrigin` (never the `url`
      option, which forces anonymous CORS), and keeps `TileWMS` for WMS, with shared layer options.
      Verify by driving (8.3).

## 6. Save (seam: save handler, `mapLayers.server.test.ts`)

- [x] 6.1 Red: saving a region's layers with a template layer through the handler reads back
      identical and can be saved again with the new fingerprint. Verify: red before 2.1 to 3.3 existed
      (or mutation of the union), green after.
- [x] 6.2 Red: a stale `known` is refused when the layers include a template layer. Verify: passes,
      and fails when the fingerprint check is removed.

## 7. Copy

- [x] 7.1 i18n: new text for `region_mapLayerUrlHint` (a WMS address with LAYERS, or an https
      address containing `{bbox-epsg-3857}` that requests 256 px images) and `form_wmsUrlInvalid`
      (names both forms), in `messages/en.json` and `messages/de.json`, no em-dashes. Verify: both
      files updated, `npm run check` sees the keys.

## 8. Verification sweep

- [x] 8.1 Mutation: `npm run test:mutation -- --mutate src/lib/entities/region/settings.ts` and
      `--mutate src/lib/map/layers.svelte.ts` (read `stryker/README.md` first); `test:mutation:server`
      for the handler. Verify: every survivor in the touched lines killed or explained.
- [x] 8.2 Over touched paths: `npx prettier --write`, `npx eslint`, `npx vitest run --project server`
      and `--project browser`, typecheck, `npm run lint:unused`, `lint:duplication`, `lint:health`.
      Verify: all clean, baselines not grown.
- [x] 8.3 Drive on the Zero build at 375x667 and 1280x800: as a region admin, add a Salzburg template
      layer (`Schummerung_DGM_Land_Salzburg/MapServer/export` with `{bbox-epsg-3857}`) to the Test
      region in the dev DB, see it draw near Salzburg at zoom 14 and up with its switcher row, reopen
      the form and see the address unchanged, then remove it. Verify: screenshots, and the stored
      layer read with psql.
- [x] 8.4 Repeat 8.3's draw and save on the PowerSync build (`PUBLIC_SYNC_ENGINE=powersync`).
      Verify: same result.

## 9. Maximum zoom (added after review: Salzburg returns a placeholder grid from zoom 16)

- [x] 9.1 Red: `readRegionSettings` reads a stored `maxZoom` whole; `mapLayerSchema` round-trips it
      and refuses 29; the merge takes the lowest cap any region set (absent when none did); a stored
      cap that is not a whole number 0 to 28 drops its layer; the fingerprint tells a set cap apart and
      leaves an unset one byte-identical. Green: `maxZoom` (whole, 0 to 28) in the shared stored
      shape, one `zoomField` schema, stored and fingerprinted only when set, `mergedCap`. Verify: each
      test failed first, then passes; `mapper.test.ts`'s unknown-key example moves from `maxZoom` to
      `tileSize`.
- [x] 9.2 Red: `createRegionLayers` gives WMS and template sources a tile grid ending at the cap,
      and leaves an uncapped template uncapped. Green: `createXYZ({ maxZoom })` as `tileGrid` on both.
      Verify: red on `undefined`/42, then green.
- [x] 9.3 i18n: `region_mapLayerMaxZoom` and `region_mapLayerMaxZoomHint` in `messages/en.json`
      and `messages/de.json`; the field gets its own row under opacity and minimum zoom, its hint at
      full width. Verify: typecheck.
- [x] 9.4 Drive at 375x667 and 1280x800 on the Zero and PowerSync builds: a Salzburg template with
      maximum zoom 15 shows enlarged relief, not the grid, at zoom 16 to 18; an uncapped save leaves
      no `maxZoom` key in the stored row. Verify: screenshots and psql.

## 10. Coverage stored and drawn (seams: `readRegionSettings`, `mapLayerSchema`, `mergeMapLayers`, `createRegionLayers`)

- [x] 10.1 Red: a stored `bounds` reads back whole; west >= east, south >= north, |lon| > 180,
      |lat| > 85.0511, three numbers or a string each drop only their layer; an uncovered layer's
      fingerprint stays identical and a set `bounds` changes it. Green: `isValidBounds` and `bounds` in
      the shared stored shape, fingerprinted only when set. Verify: each failed first; the pinned
      fingerprint in `fingerprint.test.ts` still passes.
- [x] 10.2 Red: the form field `west,south,east,north` round-trips through `mapLayerSchema` and
      `toLayerForm`; empty stores no key; lat 86, west >= east and |lon| > 180 each give a field error
      (the same `isValidBounds` as 10.1). Green: a coverage codec beside `zoomField`, spread into the
      layer only when set. Verify: red then green.
- [x] 10.3 Red: duplicates with two rectangles merge to their union; a covered duplicate FIRST and an
      uncovered one second merge to an uncovered layer (the spread of `...first` would otherwise keep
      the first's `bounds`). Green: a `mergedBounds` beside `mergedCap` that always sets the key.
      Verify: red then green.
- [x] 10.4 Red: `createRegionLayers` gives a covered layer an `extent` equal to its rectangle in
      EPSG:3857 (hand-worked corners), and none to an uncovered one. Green: `extent` from
      `transformExtent`. Verify: red then green.

## 11. Reading coverage (create `src/lib/entities/region/coverage.ts`; seam: `readCoverage` with an injected `fetch`)

- [x] 11.1 Red, from trimmed recorded capabilities: a WMS layer's own box; a layer without one takes
      its parent's; two names in `LAYERS` join into one rectangle; a -90 to 90 box comes back clamped
      to 85.0511; an unknown name or bad XML gives `null`. Green: the WMS branch, the clamp and the
      `isValidBounds` check on every answer. Verify: red then green.
- [x] 11.2 Red, from recorded JSON: an ArcGIS `MapServer/export` template asks `?f=json`, then the wide
      and tall `f=json&imageSR=4326` calls, and returns longitudes from the tall answer and latitudes
      from the wide one; a non-ArcGIS template returns `null` without any request; a rejected fetch or
      an abort gives `null`; every request carries `credentials: 'omit'`. Green: the ArcGIS branch
      (query built with `URLSearchParams`) and the 8 s timeout. Verify: red then green.
- [x] 11.3 Live check before relying on 11.2's assumption: run `readCoverage` in the browser against
      Bayern, Tirol, Vorarlberg, Steiermark, Salzburg and Oberösterreich. Verify: WMS boxes match
      the recorded ones (Bayern 8.97,47.18,14.02,50.58; Tirol 10.08,46.62,13.03,47.78) and the two
      ArcGIS boxes hug their state (no side padded by more than 0.05 degrees). If they do not, keep the
      padded box (too large only costs transparent tiles) and note it in the design.

## 12. Pages (all under `src/routes/(app)/regions/[regionId]/map-layers/`)

- [x] 12.1 i18n first: keys for the list, badges, coverage note and states, disclosure, "Show from
      zoom" and "Detail ends at zoom" with hints, hidden-rows notice, duplicate-address error, not
      found, remove dialog, in both `messages/en.json` and `messages/de.json`, `region_*` prefix, no
      em-dashes. Verify: both files carry every key; typecheck.
  - Apply note (subtract): reuse today's keys with new text instead of adding siblings:
    `region_mapLayerMinZoom` ("Show from zoom"), `region_mapLayerMaxZoom` ("Detail ends at zoom"),
    `region_mapLayerMaxZoomHint`; `region_mapLayerAdd`, `region_mapLayerRemove` and
    `region_mapLayersEmpty` serve the new pages as they are. Add only keys that are new.
- [x] 12.2 Red: `coverageImageUrl` for a WMS layer gives a `GetMap` with the coverage as an EPSG:3857
      `BBOX` and the requested size, overriding any stored `BBOX`, `WIDTH`, `HEIGHT`, `SRS` / `CRS`;
      for a template, the placeholder filled with the same box (hand-worked values). Green: the
      function in `src/lib/map/layers.svelte.ts`. Verify: red then green.
  - Built: it lives in `entities/region/coverage.ts` instead (a `.svelte.ts` module may not build a
    plain `URL`, and the list page no longer pulls in OpenLayers' layer code); tests moved with it.
  - Built: rows ask WMS services for 512 px (Bayern draws nothing for the whole state at 384 px or
    less). Driving also showed that ArcGIS answers 400 to a template whose JSON parameter keeps raw
    braces, for the row image and for the map's tiles alike; `fillBbox` now fills the placeholder
    and percent-encodes such characters for both (tested at `bboxTileUrl`).
- [x] 12.3 Write wrapper: `saveRegionMapLayer` in `entities/region/writes.ts`, the same
      `updateRegionMapLayers` mutator with `redirectTo` the map-layers list. Verify: typecheck; used by
      12.5.
  - Apply note (subtract): no new wrapper. `updateRegionMapLayers`'s only caller is the page being
    rewritten, so change its `redirectTo` to the map-layers list instead of adding
    `saveRegionMapLayer` beside it.
- [x] 12.4 List: rewrite `+page.svelte` as the row list (existing row component where one fits:
      `EntityRow` or `MenuRow`; image or placeholder, name, badge, "All zooms" or "From zoom N") with
      "Add layer" linking to `add`; keep the admin, synced and `layersComplete` states. Delete the
      multi-row form and `src/lib/forms/fields/fieldRows.svelte.ts` with its test if nothing else uses
      them. Verify: `npm run lint:unused` clean; driving in 13.3.
  - Apply note (subtract): delete `fieldRows.svelte.ts` and its test unconditionally; the old page
    is its only caller.
- [x] 12.5 Create `LayerForm.svelte` and `add/+page.svelte`: `Form` with `fill` and the two-column
      layout, `regionMapLayersSchema` seeded through `seedFollowingRows` with the whole list and
      `known`, a blank row appended and only its fields rendered; submit through 12.3. Verify by
      driving: adding a layer stores it last (psql) and lands on the list.
- [x] 12.6 Create `[layer]/+page.svelte`: the segment `fingerprint(mapLayerKey(...))` picks the row,
      mapped to an index once per seed against the seeded rows; an unknown segment shows `ErrorState`
      `notfound` with a link to the list; update the comment on `mapLayerKey`. Verify by driving: a
      saved opacity change keeps the other rows identical (psql) and lands on the list; typing in the
      address never shows not found; an old segment shows not found.
- [x] 12.7 Hidden rows and duplicates in `LayerForm.svelte`: the page runs each other seeded row
      through `mapLayerSchema.safeParse` (the store files hidden-row issues at form level with no
      path) and shows a notice naming each failing layer with a link to its page, refusing Save while
      it shows; an address whose `mapLayerKey` matches another row gives a field error before submit
      that says to remove the duplicate. Verify by driving: a row seeded with the name "Ab" by psql is
      named in the notice and the save is refused; re-entering an existing address shows the error.
- [x] 12.8 Coverage on the page: read on open and 500 ms after the address stops changing, aborting
      the previous read; an address change clears the coverage field at once; the result in page
      state, written into the form in `onBeforeSubmit` (which waits for a pending read, never writes
      `null` over a typed value, and skips the write while removing); the section keeps its height
      while reading; read-only numbers when found, note plus field (seeded with the stored value) when
      not. Verify by driving: open a layer without coverage and save (psql shows `bounds`); change a
      covered layer's address to a non-ArcGIS template and save at once (psql: no old `bounds`); a
      non-ArcGIS template shows the field; nothing below the section moves when the read lands.
  - Apply note (P34, major, converged): an address change also clears the page-state read result,
    and the 500 ms debounce counts as pending (or the result is tied to the address it was read
    for), so a Save within 500 ms of pasting never writes the old service's rectangle. Drive it by
    pasting and pressing Save at once.
  - Apply note (P35): the clear fires on user input to the address field, never on a value change:
    seeding would otherwise wipe a typed coverage and stop `seedFollowingRows` following, and Remove
    would clear the next row's `bounds`.
  - Apply note (P36): `Form` sets `submitting` only after `onBeforeSubmit` resolves, so while Save
    waits for a read the page keeps its own pending flag, passed to `submitDisabled`, with a visible
    pending state; a second press must not start a second submit.
  - Built: the ArcGIS calls ask for 2 x 256 and 256 x 2 px images. Salzburg took 14 s to render a
    fresh 4096 px one, past the 8 s budget; only the image's shape matters.
  - Driven: a quick Save after an address change waits for the answer and keeps no old coverage. It first hung: the read replaced the promise Save awaited; one shared promise now.
- [x] 12.9 Preview: create `LayerPreview.svelte` on `createBaseMap` + `createRegionLayers([layer])`,
      redrawn 500 ms after edits stop, framed on coverage, else the region's located blocks
      (`blockMapList` filtered by `regionFk`), else the default view, with the coverage outline and
      the OSM and layer credits drawn by the component through `$lib/map/attribution` (admin HTML:
      never `{@html}`, never an OpenLayers `attributions` option). Verify by driving: an opacity change
      shows in the preview before saving.
- [x] 12.10 Fields: Opacity beside "Show from zoom"; "Detail ends at zoom" inside a `Disclosure`
      "Shows a placeholder when zoomed in?", open when a cap is stored or the field has an error.
      Verify by driving: Salzburg's page opens with the section open, Tirol's closed.
- [x] 12.11 Remove: "Remove layer" opens the `Dialog` confirmation; confirm closes the dialog, drops
      the row, sets `removing` and submits through `Form` (`requestSubmit`), landing on the list;
      cancel keeps the edits. Verify by driving: psql shows the list without the layer and every other
      row, `bounds` included, unchanged.
  - Apply note (P37): the `Dialog` is portalled outside the form, so the page keeps its own handle
    on the `<form>` (an element inside `Form`'s children) to call `requestSubmit()`.
  - Apply note (P38): while `removing`, skip the shown-row checks (duplicate address, coverage) and
    render no fields for the dropped index, so removing a layer is never refused for the next one.
- [x] 12.12 Update `e2e/form-seeding.spec.ts`: the `beforeAll` wait on `mapLayers[0].name` and the
      map-layers case move to `add` and a layer page, keeping the per-region re-seed check. Verify:
      `npm run test:e2e -- form-seeding` passes.

## 13. Save and verification

- [x] 13.1 Red: through the save handler, a list holding a layer with `bounds` reads back identical and
      saves again with the new fingerprint. Verify: red before 10.1, then green.
- [x] 13.2 Mutation over `settings.ts`, `coverage.ts` and `layers.svelte.ts`; hand-back checks
      (prettier, eslint, vitest server and browser, typecheck, `lint:unused`, `lint:duplication`,
      `lint:health`). Verify: survivors in touched lines killed or explained, baselines not grown.
  - Status: `coverage.ts` 81.5%, `settings.ts` 87%; the gaps found were closed with tests. The
    remaining survivors on new lines are equivalent: a failure the `catch` already turns into
    `null`, a value set again later, or a check the comparisons after it repeat. `layers.svelte.ts`
    not rerun (its new code is one `extent` line, covered by 10.4). All hand-back checks pass; the
    duplication baseline only lost entries the old grouping of a shared e2e teardown held.
- [x] 13.3 Drive the Zero build at 375x667 and 1280x800, light and dark, en and de, in the dev
      database's test region holding the state relief layers: open and save each layer, then the
      list shows an image per covered layer and a placeholder for any the service gave none; on the
      explore map at zoom 15 near Munich the network panel shows no Tirol, Vorarlberg or Steiermark
      tile requests. Verify: screenshots, psql shows `bounds` on each saved layer.
- [x] 13.4 On the PowerSync build: the list, a layer page with its preview framed on the region's
      blocks (a layer without coverage), the coverage read, a save, a remove, and the explore-map
      check of 13.3. Verify: same results as 13.3.
  - Status (13.3 and 13.4): driven at both sizes, both themes, en and de, on the Zero build;
    Tirol and Bayern saved with coverage, the others not yet. Near Regensburg the uncovered layers
    requested tiles and the covered Tirol none. PowerSync build: list, coverage read, save and the
    block-framed preview checked; remove and the explore check not yet.
