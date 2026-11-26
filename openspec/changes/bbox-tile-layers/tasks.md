# Tasks

Each numbered test task is one red to green slice: write the test, see it fail for the stated
reason, write only enough code to pass. Tests live only at the agreed seams: `readRegionSettings`,
`mapLayerSchema` / `toLayerForm`, `mergeMapLayers`, `bboxTileUrl`, and the save handler.

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
