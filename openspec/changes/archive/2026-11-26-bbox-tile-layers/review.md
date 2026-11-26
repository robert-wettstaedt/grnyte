# Plan review

Status: stale (2026-11-26: preview ignores minZoom, user decision after driving; spec + design one line each)

Scope: groups 1 to 9 of `tasks.md` are implemented and committed. This review covers the revision
that adds layer coverage and the map-layers list and per-layer pages (tasks groups 10 to 13 and the
matching parts of proposal, spec and design).

## Rounds

### Round 1, snapshot `5bd11f60ea7f526a793c6fb2714a5ced73573955`

Reviewers: reader, grounding, security. Not clean: 4 blockers, 13 majors. All fixed in the
artifacts; apply notes written into the tasks they belong to. No decisions for the user.

Reader's paraphrases:

> **What this proposes.** Region map overlays gain a `template` kind (an https address containing
> `{bbox-epsg-3857}`) and an optional `maxZoom`; both are already built. The revision adds an
> optional stored `bounds` rectangle [w,s,e,n], which becomes the OpenLayers layer's `extent`, so no
> tiles are requested outside it. The browser reads the coverage from the service on the layer's
> page: WMS GetCapabilities, or ArcGIS `?f=json` reprojected through two export calls. It is saved
> with the layer. The single multi-row map-layers form becomes a list with thumbnails, plus
> `/map-layers/[layer]` (a hash segment) and `/map-layers/add` pages with a live preview. Saving still
> sends the whole list through the same mutator and its `known` guard.
>
> **How the existing system works, per this plan.** Layers live in `regions.settings.mapLayers`
> (jsonb). `readRegionSettings` parses them one by one, leniently; an unknown layer is dropped and
> `layersComplete` goes false, which blocks saving. The form is one `Form` over
> `regionMapLayersSchema` (`id`, `known`, `mapLayers[]`). It is seeded only when the region is synced
> and `layersComplete` holds. It submits through `writes.ts` to `updateRegionMapLayers`, whose server
> half checks the `known` fingerprint and writes through `settings.server.ts`. The map merges layers
> across a user's regions by `mapLayerKey` and builds one OpenLayers layer per merged layer in
> `createRegionLayers`.

Both match the intent.

### Round 2, snapshot `054bf277cb9e94066f76bf8d8a6b15dbf38bc941`

Reviewers: reader (fresh), grounding, security. Not clean: P2 reopened as a blocker, 2 majors. All
fixed; 4 apply notes written into tasks. No decisions for the user.

Reader's paraphrases (round 2):

> **What this proposes.** Region map overlays already have a `template` kind and an optional
> `maxZoom`. The revision adds an optional stored `bounds` [w,s,e,n], with one `isValidBounds` check on
> the stored read, in the form and in `readCoverage`. It becomes the OL `TileLayer` `extent`. Merged
> duplicates take the union, or no bounds when any has none. The layer's page reads the coverage from
> the service (WMS capabilities, or ArcGIS `?f=json` plus a wide and a tall `export` call), clamped
> and kept in page state, then written into the form in `onBeforeSubmit`. The multi-row form becomes
> a list with thumbnails plus `add` and `[layer]` pages sharing `LayerForm.svelte` with a live
> preview; it still seeds the whole list and `known` but shows one row, and saves through a wrapper
> that redirects to the list.
>
> **How the existing system works, per this plan.** Layers live in `regions.settings.mapLayers`,
> parsed leniently per layer; an unknown layer sets `layersComplete` false, which blocks saving. The
> strict stored shape accepts values the form refuses. The map merges once and builds `TileWMS` or
> `ImageTile` layers in `createRegionLayers`. The page is one `Form` over `regionMapLayersSchema`,
> gated on `synced` and `layersComplete`, seeded through `seedFollowingRows`, submitting through
> `writes.ts` to `updateRegionMapLayers`, whose server half checks `known`.

Both match the intent.

### Round 3, snapshot `2c5abd06d53fa6d6385a89a718989ec1192a3e3b`

Reviewers: reader (fresh), grounding, security. Security and grounding clean. The reader's one major
(P34) sits on round 2's fix for P29 and is implementation-level, so the review converged: P34 is an
apply note under task 12.8 with its severity kept. Status clean. No decisions for the user.

The reader's round-3 paraphrases match round 2's, extended by the new parts (per-row `safeParse`,
duplicate refusal, address change clearing coverage, Save and Remove both submitting through `Form`).

## Claim table (grounding, round 1)

| Claim | Status | Evidence |
|---|---|---|
| `mapLayerShape`, `wmsUrl` codec | contradicted → fixed | now `sharedShape`/`wmsShape`/`templateShape`, `layerUrl` (settings.ts:13-24, :231) |
| `createWmsLayers`; `Map.svelte` merges twice | contradicted → fixed | `createRegionLayers` (layers.svelte.ts:263); one merge |
| stored and strict schemas, `readRegionSettings`, `layersComplete` | holds | settings.ts:27-31, :127-161 |
| `mapLayerKey`, `mergeMapLayers`, spread merge, `mergedCap`, `zoomField` | holds | settings.ts:71, :103, :358-379, :334, :257 |
| fingerprint covers type/url, appends `maxZoom` only when set | holds | settings.ts:77-93 |
| `toLayerForm` round-trips | holds only for form-written rows → fixed | strict shape looser than the form |
| write path writes → mutator → `known` → settings.server | holds | writes.ts:24-25; edit.server.ts:88-120 |
| page stays after save and `replaceState`s | contradicted → fixed | `Form` exits unless `stayOnSubmit`; `redirectTo` region |
| membership via mapper with `synced`, `layersComplete` | holds | mapper.ts:83-101 |
| page is one `Form` with `fieldRows`, gated | holds | map-layers/+page.svelte; dto.ts:98-105 |
| `fingerprint` URL-safe | holds | djb2 base36 |
| `createBaseMap` `extraLayers` | holds | construction only |
| `contentExtent` | holds | camera.svelte.ts:62 |
| region block query | holds → named | `blockMapList`, PowerSync twin |
| `Disclosure`, `ErrorState` notfound | holds | |
| `Dialog` sheet on phone | contradicted → fixed | always a centred card |
| page width from `Form` | holds, capped → fixed | `fill` |
| "form counts as changed" | missing → removed | no dirty state |
| form-level error names the layer | missing → task 12.7 | |
| layer `extent` stops requests | holds | ol TileLayer renderer `getRenderExtent` |
| `transformExtent` | holds | ol/proj.js:632 |
| `DOMParser` in tests | holds | jsdom |
| no twin needed | holds | `blockMapList` twin resolved by `twinResolver` |

## Findings

| # | raised by | file:line | severity | claim | status | reason/evidence |
|---|---|---|---|---|---|---|
| P1 | reader, grounding | tasks.md:157 | blocker | `Dialog` is never a sheet | fixed | 12.11 uses the app's `Dialog` card, as every settings remove |
| P2 | reader, grounding | design.md:152-159 | blocker | hidden rows can fail the form check invisibly | fixed | design "Hidden rows", spec scenario, task 12.7 |
| P3 | reader, grounding | design.md:157-159 | blocker | stay-and-`replaceState` cannot work | fixed | save exits to the list via `saveRegionMapLayer` (12.3); scenario dropped |
| P4 | grounding | design.md:5-14, proposal.md:85 | blocker | stale symbol names | fixed | Context rewritten for post-group-9 code |
| P5 | reader, grounding | design.md:160-162 | major | duplicate keys share a segment | fixed | field error before submit (12.7), spec scenario |
| P6 | reader, grounding | tasks.md:140-146 | major | `e2e/form-seeding.spec.ts` breaks | fixed | task 12.12 |
| P7 | reader | design.md:139-142 | major | on-open read stops re-seeding | fixed | result in page state, written in `onBeforeSubmit` |
| P8 | reader | design.md:139-141 | major | stored coverage never re-read or editable | fixed | read on every open; failed read seeds the field |
| P9 | reader, security | design.md:125-128 | major | ±90 lat from WMS fails the check | fixed | clamp + `isValidBounds` in `readCoverage`, 11.1 case, spec scenario |
| P10 | security | design.md:107-115 | major | form check not tied to stored rule | fixed | one `isValidBounds`, 10.2 cases, spec scenario |
| P11 | reader, grounding | tasks.md:168-170 | major | 13.3 cannot pass in order | fixed | open and save each layer first |
| P12 | grounding, reader | design.md:39-40 | major | `Form` caps width | fixed | `fill` and own columns |
| P13 | grounding, reader | spec.md:162 | major | no "changed" state | fixed | scenario reworded to the stored result |
| P14 | grounding, reader | tasks.md:173 | major | PowerSync checks miss new reads | fixed | 13.4 widened |
| P15 | grounding | tasks.md:143-153 | major | no paths; `fieldRows` orphaned | fixed | paths named; 12.4 deletes it if unused |
| P16 | grounding | tasks.md:143-153 | major | 12.3 not one edit | fixed | split into 12.3 to 12.12 with observable checks |
| P17 | reader, grounding | tasks.md:115 | apply-note | merge test order | apply-note | in 10.3 |
| P18 | reader | design.md:166-167 | apply-note | disclosure hides its error | apply-note | open on error, 12.10 |
| P19 | reader | design.md:172-173 | apply-note | coverage section shifts | apply-note | height kept, 12.8 |
| P20 | grounding | design.md:181 | apply-note | GetMap param override; OL in list | apply-note | 12.2 overrides; OL import accepted for an admin page |
| P21 | grounding | design.md:180 | apply-note | preview draws its own credits | apply-note | 12.9 |
| P22 | grounding | tasks.md:158 | apply-note | Dialog navigation trap | apply-note | 12.11 |
| P23 | grounding | tasks.md | apply-note | i18n order, row component, 10.1 cases | apply-note | 12.1 first, 12.4, 10.1 |
| P24 | security | design.md:122-143 | apply-note | fetch options, `URLSearchParams` | apply-note | design + 11.2 |
| P25 | reader | spec.md:188 etc. | nit | byte-identical, test region, `mapLayerKey` comment | fixed | reworded; 12.6 updates the comment |
| P26 | reader | design.md:181 | nit | OL pulled into list page | nit | accepted |
| P27 | grounding | proposal.md | nit | URL change not flagged in proposal | fixed | "Not breaking" names the route |
| P2 (r2) | reader, grounding | design.md:177-180 | blocker | store files hidden-row issues at form level with no path, so the notice cannot name the layer | fixed | the page runs `mapLayerSchema.safeParse` per other row (design "Hidden rows", 12.7) |
| P28 | reader, grounding | design.md:187-193, tasks.md:185 | major | Remove's submit writes the read coverage onto the next row | fixed | `removing` flag skips the write; `requestSubmit` through `Form`; 12.11 psql check |
| P29 | reader | design.md:153-162 | major | a new address keeps the old rectangle | fixed | address change clears the field; Save waits for a pending read; spec scenario; 12.8 drive |
| P30 | reader | tasks.md:163 | apply-note | map segment to index once per seed | apply-note | 12.6, design "Row identity" |
| P31 | security | tasks.md:177-181 | apply-note | preview credits are admin HTML | apply-note | 12.9 names `$lib/map/attribution` |
| P32 | grounding | design.md "Duplicates" | apply-note | a stored duplicate pair blocks that page | apply-note | error says to remove the duplicate |
| P33 | grounding | tasks.md:188 | apply-note | e2e `beforeAll` also waits on the old field | apply-note | 12.12 |
| P34 | reader | design.md:153-163 | major | a Save within the 500 ms debounce writes the old rectangle | apply-note | converged: sits on P29's fix, implementation-level; apply note under 12.8 |
| P35 | reader | design.md:161 | apply-note | clear on user input, not on value change | apply-note | 12.8 |
| P36 | reader, grounding | design.md:162 | apply-note | no pending state while Save waits for a read | apply-note | 12.8 |
| P37 | grounding | tasks.md 12.11 | apply-note | portalled `Dialog` cannot reach the form | apply-note | 12.11 |
| P38 | reader | design.md:191-205 | apply-note | shown-row checks run on the next row while removing | apply-note | 12.11 |
