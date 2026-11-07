# Design

## Context

`RouteFormFields.svelte` is the shared body of three forms: the add page, the topo editor's new-route step (`TopoAddRouteModal.svelte`) and the edit forms, which pass `route`. Zero offers `ILIKE` and no fuzzy operator. A query's text is a query argument, so each distinct term costs its own server registration and CVR write (see `debouncedQuery` in `EntitySearch/search.svelte.ts`).

`listRoutesForMap` already returns slim route rows with no related trees, filters `deletedAt IS NULL`, accepts `regionFk`, and has the `field` offline policy. A merge stamps `deleted_at`, and `routes_merged_is_deleted` enforces it, so merged routes are excluded too.

## Goals / Non-Goals

**Goals:**

- One query per form rather than one per keystroke.
- Quiet by default: on the 200 dev names, no name triggers a region-wide suggestion from another by chance.
- Works from whatever rows are on hand, offline included.

**Non-Goals:** see proposal.md. Also no ranking by grade, tags or other fields, which are empty when the name is typed.

## Decisions

### Reads: score in the browser over `routeMapList`

All reads are Zero queries, and no writes or remote functions change. `routeMapList(() => ({ regionFk: block.regionFk }))` supplies the candidates, and its mapper gains `areaIds` so a row can be placed in the block's sector without a related tree. `areaIds` is already a synced column.

Rejected: `ILIKE` per term (one registration per term, no typo matching, and `content` also searches descriptions). Rejected: `pg_trgm` through a remote function (migration, network call per term, no offline answer).

The resource is built in `quietly` and enabled on the name field's first focus, so visiting the form for another reason costs nothing.

### Matching: a pure function, no library

New `src/lib/entities/route/similarNames.ts`, a pure module holding normalization, edit distance and the rule in `specs/guidebook/duplicate-suggestions/spec.md`. It returns ranked ids and match kinds and knows nothing about Svelte or Zero. The interface has two steps, `const match = similarNames(rows, block)` then `match(name)`, so names are normalized when the rows change rather than on every keystroke. Edit distance is optimal string alignment, about 15 lines, so a neighbour swap counts as one edit.

Normalization is lowercase, `ß` to `ss`, NFD with marks stripped, then non-letters and non-digits to a space. There is deliberately no German table: `ü` folds to `u`, which leaves "Mueller" one edit from "Muller", and converting `ue` to `ü` would corrupt words like "Dauer".

Measured on 200 dev names with 24 labelled duplicates and 27 labelled distinct pairs:

| Rule                                                     | Duplicates caught | Distinct pairs flagged | Names triggering across region |
| -------------------------------------------------------- | ----------------- | ---------------------- | ------------------------------ |
| Whole string, 1 edit from 4 and 2 from 8                 | 24/24             | 18/27                  | 10                             |
| Elasticsearch `AUTO:3,6` limits                          | 24/24             | 21/27                  | 11                             |
| Fuse.js 7.1.0, threshold 0.3                             | 24/24             | 20/27                  | 56                             |
| Fuse.js 7.1.0, threshold 0.2                             | 23/24             | 17/27                  | 32                             |
| Chosen rule, before the long-word first-letter allowance | 24/24             | 7/27                   | 0                              |

The labels were written by hand and the chosen rule was shaped after seeing the first rule's failures, so the numbers show direction and not accuracy. The pairs become the matcher's test cases. The Fuse figures include its substring matching, which the chosen rule allows only nearby.

Rejected: Fuse.js. It offers one general score, and word-by-word comparison, exact numbers, the first-letter rule, uncommon words and the near and far split would all still be written around it, for 5 to 6 KB gzipped.

Rejected without testing: Jaro-Winkler and trigrams. Sources report mixed results by dataset, and the chosen rule was already quiet on this data.

Word counts for the uncommon-word rule are computed per region rather than from a stoplist, because dev names mix English, German, Spanish and Italian. The limit of 2 gave 10 pairs on dev, against 34 with a limit of 3.

### Reactive shape: a small resource beside the form

New `src/lib/entities/route/similarMatches.svelte.ts`, not `similarRoutes.svelte.ts`: beside `SimilarRoutes.svelte` that name collides on a case-insensitive disk, both for its test file and for the `./similarRoutes.svelte` import.

- Normalized names and word counts are `$derived` from the rows, once per row change rather than per keystroke.
- The term goes through the existing `debouncedQuery` at 200 ms. Scoring is local and needs no delay, but each new set of top ids registers a query, and a list changing on every letter is harder to read.
- The top three ids go to the existing `routesByIds` for display rows, which already read through `toRouteListItem`, so names and crumbs stay with the mapper.

`createResource` rebuilds on a dependency change rather than a value change, and each rebuild leaks the `$effect.root` its `Query` opened. So the id list MUST only change identity when its contents change: hold it in a `$derived` keyed on the joined ids. The test suite pins this.

### UI: `SimilarRoutes.svelte`, built from `RouteRow` and `Modal`

No route preview component exists. `RouteRow` already renders name, grade, stars, description, topo thumb and `crumbs`, and accepts `onclick`, which `Row` renders as `type="button"`, so a tap cannot submit the form. The preview is a `Modal` with `panel` and `backdrop`, bound `open` and no trigger. It follows the route page rather than repeating the row: crumbs as the eyebrow above the name, then grade, stars and first ascent year in one row, the topo with the route's line when it is drawn, tags and description, all from the list item with no extra query. Under a topo or description the action is pinned in the `Modal` footer, so it cannot fall below the fold of the half-height phone sheet. Otherwise it follows the content, because pinned under a short preview it sits at the sheet's bottom with a gap above it.

`RouteFormFields` renders `SimilarRoutes` directly after the name field when `route == null`, and gains one optional prop, `similar?: { action: Snippet<[RouteListItem, () => void]>; offers: (route) => boolean }`: the action receives the route and a close function, and `offers` says which routes it applies to, so the preview offers nothing rather than an empty footer. Without it, the preview links to `entityHref('routes', id)`. `TopoAddRouteModal` passes `topo_addRouteToPhoto`, offered for ids in `candidates` and nothing else. It closes the preview, awaits `tick()`, then calls the existing `pick`, following the nested `Modal` rule in AGENTS.md.

The list is a plain list with a polite `role="status"` announcement, not a combobox, because picking a row does not fill the field.

### Feel: quiet, steady and in reach

Reviewed against `/apple-design`. Each choice serves a named failure on this screen.

- **Grouping:** one bordered group holding `RouteRow`s with `variant="option"`, after `FieldWrapper` so the name hint stays with its input. Three separate cards would compete with the form's own fields.
- **Compact rows:** the list passes `description: ''`, so rows show thumb, crumbs, name, grade and stars. The preview shows the description and tags. Three rows with markdown descriptions would not fit above a phone keyboard.
- **Steady while typing:** the previous rows stay until the next set has hydrated, so the group does not collapse and reopen between letters. Rows are keyed by id and use `animate:flip` with `motion()`, so a row that stays a match keeps its identity while the order changes.
- **Interruptible:** the group and rows use bidirectional `transition:slide` with `motion()`, not separate `in:` and `out:`, so an interrupted slide reverses from the current height. In practice the whole list rarely reverses: reopening waits out the 200 ms debounce, so a 150 ms close has already finished. 150 ms follows the AGENTS.md convention. A spring has no gesture to carry velocity from here.
- **A blur never collapses the list:** tapping a row blurs the input on press, and a collapse at that moment would move the row from under the finger and miss the tap. The hold from the focus rule covers this.
- **Press feedback:** `Row` has a `hover:` state and no press state, so a touch device gets nothing. `Row` gains an `active:` background, set on press without waiting for the colour transition. This changes every tappable row in the app, which is why it belongs in the primitive rather than a copy here.
- **Exact match is a warning, not an error:** it uses the `info` icon with a semibold sentence, matching `routes_form_optionalNote`, with no error colour and no `aria-invalid`, because nothing is wrong and submitting still works.
- **Dim to focus:** the preview is a modal task, so it uses `Modal`'s `backdrop`. It opens from the bottom on mobile through the existing sheet. Closing returns focus to the row, not the input, so the phone keyboard does not jump back.
- **No extra feedback:** no sound, haptics or translucent material. These suggestions are a quiet prompt, and the form's surfaces stay solid.
- **Reduced motion:** every duration comes from `motion()`, so slide and flip shorten together.
- **Keyboard:** rows are ordinary tab stops between the name field and the grade picker.

### Placement: a deliberate exception to the "append low" rule

AGENTS.md says a section with its own query and no empty state goes low and never inserts above rendered content. This one goes directly under the name field, because that is the moment the answer helps, and at the bottom of the form it would arrive after the rest has been filled in.

The rule's concern is content moving under someone. Updating only while the name field has focus keeps that from happening: the person is looking at the field, and the fields below are not in use. The one exception is a name typed under focus that settles just after the blur: it lands once, because a list that describes an earlier name can claim a duplicate that is not there, or miss one that is. Rows also wait for the server's answer, not just the local route row, whose block, area, tags and topo can still be on their way; offline, the local rows are all there is. Rejected: a floating dropdown, which reads as autocomplete and competes with the mobile keyboard.

### Copy

Reviewed against `/writing-guidelines`. New keys:

| Key                               | English                                         | German                                                    |
| --------------------------------- | ----------------------------------------------- | --------------------------------------------------------- |
| `routes_form_similarAnnouncement` | Routes with a similar name are listed below.    | Routen mit ähnlichem Namen stehen darunter.               |
| `routes_form_similarExact`        | This block already has a route called “{name}”. | An diesem Block gibt es schon eine Route namens „{name}“. |
| `routes_form_similarHeading`      | Is your route one of these?                     | Ist deine Route eine davon?                               |

The heading points at the list and names what is being compared. It asks the reader something they can answer by looking, so it is not a rhetorical question. The quotes follow `blocks_nameExists`. `{name}` is the stored route's display name from the mapper, not the typed text, and Svelte escapes it as text.

The announcement is screen-reader only and has no count, so it needs no plural form. For an exact match on this block, `role="status"` announces `routes_form_similarExact` instead.

Reused keys: the route's own name as the preview's title, `routes_showDetails` ("Details") for going to the route, and `topo_addRouteToPhoto` ("Add route to this photo") for the topo action. No copy says "no match", "duplicate" or "similar route not found".

## Test seams

Tests sit only at these seams, built in this order with one red and green cycle per behaviour:

1. **Matcher:** `similarNames.ts` through `similarNames(rows, block)` and `match(name)`. Every matching rule and the ranking, with literals from the spec and the labelled pairs. No fake. Normalization and edit distance are tested only through it.
2. **Resource:** `similarMatches.svelte.ts`. No query before first focus, `regionFk` from the block, the hold after blur, previous rows kept while the next set hydrates, and no rebuild when the top ids are unchanged. Only Zero's query layer is faked.
3. **Component:** `SimilarRoutes.svelte` with Testing Library, with the resource faked. Nothing shown when empty, exact wording, a tap leaving the name alone, the preview, and `similarAction`.
4. **Form:** `RouteFormFields.svelte` in its existing test file, with the component stubbed. Shown on add, not on edit.

No new Playwright spec, since the logic risk sits in the first seam. The nested `Modal` teardown, layout stability, keyboard behaviour, query registrations and load time are checked by driving the app.

## Risks / Trade-offs

- [Loading a large region's names is slow on a phone] → Measured on the 7,940-route region through prod-speed `zero-perf` at 4x CPU throttle, with the device's local store warm: 1.1 s from focus to list including typing, longest task 133 ms, no visible lag. A cold sync was not measured. Failure is benign, because suggestions appear late or not at all and the form is unaffected.
- [Registering `listRoutesForMap` with only `regionFk` adds a query beside `/explore`'s] → One registration per form use, and the rows are ones `field` already keeps. A task checks the network and that no per-keystroke query appears.
- [A slow sync means a late match never appears once focus has left] → Accepted, because moving the form under someone is worse. Merge still covers the miss.
- [First-letter typos under 8 characters are missed, such as "Jarma" for "Karma"] → Accepted. Allowing them flags "Zecke" and "Hecke".
- [Real-word neighbours of one edit still match, such as "Bell" and "Ball"] → Accepted. Only context separates them, and each row shows it.
- [The uncommon-word limit passes almost every word in a small region] → Few names exist there, and this rule only applies nearby.
- [Tuning was done on dev names, partly seeded] → Thresholds live in one tested function, so adjusting them later is one edit.
- [Three rows end about 580 px down at 375x667, so a phone keyboard covers all but the first row] → Accepted for now: the form scrolls and nothing blocks submit. Measured from layout, not on a real keyboard.
- [On desktop in the topo editor, the new-route panel behind a preview is not dimmed] → Cosmetic, the preview is still modal and on top.
- ["Show details" abandons uploads in progress] → Driven against Cancel with a real upload: both leave no file row, no route and no errors, so it is no worse than Cancel.

## Migration Plan

No schema change, migration or backfill. The app deploys alone, and rollback is a revert. `routeMapList`'s extra field is client-side, so tabs on the old build are unaffected.
