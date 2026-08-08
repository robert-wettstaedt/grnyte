# Activity Feed — implementation plan

Source design: `grnyte Activity Feed.dc.html` (Claude Design project
`4883f54f-bca4-43a0-aa1c-f463871abdf0`), direction **2a "the hybrid, with scope"**.

Branch `feature/activity-feed`, worktree `.claude/worktrees/activity-feed`, based on
`feature/2.0`. The main checkout is untouched.

---

## 1. What already exists

| Thing                  | State                                                                                                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activities` table     | Full audit log, RLS-gated per region, indexed on createdAt/entityId/entityType/type/userFk/regionFk                                                                                                            |
| `activity.server.ts`   | Write side only: `createUpdateActivity`, `insertActivity` (debounce), `deleteActivity`                                                                                                                         |
| `activities.remote.ts` | One query: `userContributionCount`. Nothing else.                                                                                                                                                              |
| Zero                   | `activities` is in `zero-schema.gen.ts` and `permissions.ts`. Relations: **`user` and `region` only**                                                                                                          |
| `/feed` route          | `(app)/(shell)/feed/+page.svelte`, renders "coming soon"                                                                                                                                                       |
| Reusable UI            | `EntityRow/{Route,Area,Block,User}Row`, `Avatar`, `Image`/`Media`, `Icon`, `Modal` (mobile sheet / desktop aside), `QueryState`, Skeleton `SegmentedControl`, `state/now.svelte.ts`, `entities/grade/color.ts` |
| Global state           | `userRegions`, `grades`, `user`, `gradingScale` already on context                                                                                                                                             |

### The one hard constraint

`activities.entityId` is **`text`** and `entityType` is polymorphic. Zero cannot join it to
`routes` / `blocks` / `areas` / `ascents`. Entity resolution is therefore a second pass:
collect ids per type from the synced activity rows, hydrate them through the existing
per-entity list resources, join in memory.

---

## 2. Decisions taken

| Decision            | Choice                                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Direction           | 2a hybrid: grouped cards + entity rows + full-width media block + scope model                                                                 |
| Data source         | Zero sync + client-side grouping                                                                                                              |
| Sync window         | `orderBy createdAt desc, limit 50`, "load older" bumps by 50. Tune after it is on screen                                                      |
| Grouping            | session > burst > entity, first match wins                                                                                                    |
| Event coverage      | Render only what mutations write **today**. Gaps listed in §7, filled later                                                                   |
| Unresolved entities | Tombstone (deleted) + skeleton (not yet synced), both render                                                                                  |
| Realtime            | "N new" pill holds the scroll; merging is explicit                                                                                            |
| Surfaces            | Global `/feed` **and** a per-entity activity section on area/block/route detail                                                               |
| Verb copy           | One **full sentence** per key with `{actor}` and `{name}` placeholders, plus a `person` variant for your own rows. Not verb fragments, see §3 |
| Your own activity   | Renders inline in the global feed, reading "You …" with a "Me" avatar. "Just me" then narrows to only your rows                               |
| Region chip         | Hidden for a user who belongs to one region, who has nothing to narrow to                                                                     |

Grouping rules in full:

```
ascent rows        -> SESSION   same person + same day + same area
crag edit rows     -> BURST     same person + same area + within 30 min
anything left      -> ENTITY    same entity + any person + within 30 min
no match           -> single card
```

---

## 3. Activity taxonomy

Everything the mutation layer writes today. `(entityType, type, columnName)` is the key that
selects a verb, an icon and a diff renderer.

**Card verbs are whole sentences, not fragments.** The design renders the headline as one line,
`<strong>{who}</strong> {verb} <strong>{what}</strong>`, with the entity name inline. Fragment
verbs only work in English word order: German puts the participle after the object ("hat die
Route Rampe hinzugefügt"), and the design's own "You" cards need "Du hast" against "{actor} hat".
So each key holds the full sentence with `{actor}` / `{name}` placeholders and a `person`
variant (`self` / catch-all), and `Message.svelte` splits the resolved string to render the two
placeholders as markup. The "Card verb" column below is shorthand for the English catch-all.

### Crag data

| entityType | type    | columnName                                                                                              | Written by                                 | Card verb                |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------ |
| `area`     | created | —                                                                                                       | `areas.remote.ts:72`                       | added the area           |
| `area`     | updated | `name` \| `description`                                                                                 | `:105`                                     | renamed / edited         |
| `area`     | updated | `parking location`                                                                                      | `:362`                                     | set the parking          |
| `area`     | deleted | `parking location`                                                                                      | `:417`                                     | removed the parking      |
| `area`     | deleted | —                                                                                                       | `:221`                                     | deleted the area         |
| `block`    | created | —                                                                                                       | `blocks.remote.ts:92`                      | added the block          |
| `block`    | updated | `name`                                                                                                  | `:181`                                     | renamed                  |
| `block`    | updated | `location`                                                                                              | `:150`, `:221`, `:266`                     | placed / moved the block |
| `block`    | deleted | `location`                                                                                              | `:166`                                     | removed the location     |
| `block`    | updated | `topo`                                                                                                  | `topos.remote.ts:23`                       | redrew the topo          |
| `block`    | deleted | —                                                                                                       | `:380` (`oldValue` = name)                 | deleted the block        |
| `route`    | created | —                                                                                                       | `routes.remote.ts:191` (`newValue` = name) | added the route          |
| `route`    | updated | `name` \| `description` \| `gradeFk` \| `rating` \| `tags` \| `firstAscensionists` \| `firstAscentYear` | `:274`                                     | changed …                |
| `route`    | deleted | —                                                                                                       | `:416` (`oldValue` = name)                 | deleted the route        |

### Ascents

| entityType | type    | columnName                                                                              | Written by                                                      | Card verb                         |
| ---------- | ------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------- |
| `ascent`   | created | —                                                                                       | `ascents.remote.ts:67` (`newValue` = flash/send/repeat/attempt) | flashed / sent / repeated / tried |
| `ascent`   | updated | `dateTime` \| `gradeFk` \| `humidity` \| `notes` \| `rating` \| `temperature` \| `type` | `:104`                                                          | edited the ascent                 |
| `ascent`   | deleted | —                                                                                       | `:170` (`oldValue` = type)                                      | removed an ascent                 |

### Files

| entityType      | type    | columnName | Written by            | Card verb       |
| --------------- | ------- | ---------- | --------------------- | --------------- |
| _(parent type)_ | deleted | `file`     | `files.remote.ts:246` | removed a photo |

**Uploads write no activity row at all.** See §7.

### People

| entityType | type    | columnName   | Written by              | Card verb                 |
| ---------- | ------- | ------------ | ----------------------- | ------------------------- |
| `user`     | created | `invitation` | `regions.remote.ts:220` | invited                   |
| `user`     | updated | `invitation` | `invite.server.ts:180`  | joined                    |
| `user`     | deleted | `invitation` | `regions.remote.ts:265` | revoked the invite for    |
| `user`     | updated | `role`       | `:372`                  | made … an editor          |
| `user`     | deleted | `role`       | `:406`, `:480`          | removed … from the region |
| `user`     | updated | `username`   | `users.remote.ts:57`    | changed their name        |

### Field registry (`fields.ts`)

One place mapping `columnName` to a label key, an icon and a diff renderer, so `en`/`de` cannot
drift per screen. The design's renderers:

| columnName                            | Renderer                                  | Note                                                              |
| ------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------- |
| `gradeFk`                             | grade pill → grade pill                   | ids resolve against `globalState.grades`                          |
| `rating`                              | stars → stars                             |                                                                   |
| `tags`                                | `+ tag` / `− tag` chips                   | stored comma-joined, split on `,`                                 |
| `firstAscensionists`                  | chips                                     | stored comma-joined                                               |
| `description`, `notes`                | prose, collapsed, "Compare, N characters" |                                                                   |
| `name`, `firstAscentYear`, `dateTime` | text chip → text chip                     |                                                                   |
| `location`, `parking location`        | map thumb                                 | **no old/new stored**, renders as "Location updated" only, see §7 |
| `topo`                                | topo glyph                                | no per-line diff                                                  |
| `role`, `invitation`, `username`      | user row                                  |                                                                   |
| `file`                                | photo glyph                               |                                                                   |

---

## 4. Architecture

### Data layer — `src/lib/entities/activity/`

```
dto.ts                 ActivityDto, ActivityGroup, ActivityCategory, ChangeDto
mapper.ts              zero row -> ActivityDto
queries.ts             listActivities defineQuery (Zero, region-gated)
resources.svelte.ts    activityList(filter)
grouping.ts            pure group(activities) -> ActivityGroup[]   <- unit tested
grouping.test.ts       the one runnable check
fields.ts              the field registry from §3
entity.ts              the refs a window has to hydrate
card.ts                what a card says about a group (keys, not copy)
hydrate.svelte.ts      the six by-id fetches + the pure join onto the refs
```

`listActivities` args: `{ limit, regionFk?, userFk?, category?, entityId?, entityType? }`.
Category maps to a Zero `where`: `ascent` = `entityType = 'ascent'`, `update` = everything else.
Per-entity scope matches `entityId+entityType` OR `parentEntityId+parentEntityType`.

**Entity hydration.** Every list resource now takes an id set (`areaList`, `blockList`,
`routesByIds`, `ascentsByIds`, `usersByIds`, and `filesByIds`, added for the upload cards,
whose rows point at the file itself). `hydrate.svelte.ts` collects the ids per type — the
entities the cards point at **plus the parents a grouped headline names** — fetches them and
joins them onto the refs.

The join decides, per ref, between "still syncing" (absent, a skeleton) and "hydration
finished without it" (an explicit `null`, a tombstone), which is why it is a pure function
with its own test. An ascent depends on two waves (its route arrives after it), so it only
counts as answered once the routes have answered too; otherwise it flashes a tombstone.

### Components — `src/lib/components/ActivityFeed/`

Five files, not one per activity type. The card is one component that switches on the group
kind; the entity rows inside it are the existing `EntityRow` primitives.

```
ActivityFeed.svelte        list, day dividers, load-older, "N new" pill
ActivityCard.svelte        header (avatar/who/verb/what/time/status badge), sub line,
                           media block, entity rows, note, expand toggle
ActivityChanges.svelte     expanded typed diff list, dispatches on fields.ts
ActivityFilters.svelte     title + region chip + filter button + segments + active chips
ActivityFilterSheet.svelte Modal: region picker, person picker, reset, apply
```

Plus a `.stories.svelte` beside each, driven by fixtures that mirror the design's sample week
(flash with photos, topo redraw, 12-edit burst, photo upload, session of 4 ascents, new area,
grade change, deleted route, role grant, tombstone, skeleton).

### Page wiring

- `(app)/(shell)/feed/+page.svelte` — `ActivityFilters` + `ActivityFeed`, filter state in the
  URL so the view is shareable and back works.
- Area / block / route detail — `ActivityFeed` scoped to that entity, no filters.

---

## 5. Phases

1. **Data layer.** dto, mapper, queries, resources, `grouping.ts` + its test, `fields.ts`,
   `verbs.ts`. Add `id: number[]` to the route/block/ascent list filters. No UI.
2. **i18n.** Every verb, field label, filter label, summary string and empty state into
   `messages/en.json` + `messages/de.json`, `activity_*` / `feed_*`, sorted, no em-dashes.
3. **Cards + stories.** Build the five components against fixtures, eyeball in Storybook.
   This is where each activity type gets its visual, in isolation, before any real data.
4. **Feed page.** Wire real resources, day dividers, load-older, "N new" pill.
5. **Filters.** Segments, region chip (only when `userRegions.length > 1`), person sheet,
   removable chips, empty-with-filters state, URL sync. The person sheet lists the members of the
   regions in scope (`userList`, capped at 50, no search) with `Just me` pinned above them; each
   region row reads out the role held there. The URL is mirrored through
   `syncSearchParams` / `withSearchParams` in `state/navigation.svelte.ts`, one `URL` on both sides
   so the query survives its own round trip.
6. **Per-entity activity.** Same `ActivityFeed` on area/block/route detail.
7. **Verify.** `/grnyte-verify` against real data, plus a Playwright spec for filter + expand.

Phases 1–3 are independent of each other's UI and can land as separate commits.

**Done: 1–5.** `/feed` runs on real data and narrows by segment, region and person. 6–7 are open.

---

## 6. Reuse checklist

Nothing on this list gets hand-rolled:

- entity rows → `EntityRow/{Route,Area,Block,User}Row.svelte`
- a message with inline markup (the card headline) → `Message/Message.svelte` + `splitMessage`
- avatars → `Avatar`
- photos → `Image` / `Media`
- grade pill colours → `entities/grade/color.ts`
- segmented control → Skeleton `SegmentedControl` (already used in `LocationPicker.svelte`)
- filter sheet → `Modal` (mobile sheet, desktop right aside)
- loading/empty/error → `QueryState`
- relative times → `state/now.svelte.ts`
- icons → `<Icon name="…">`

---

## 7. Gaps and open questions

**Gaps in the data, discovered while reading the write sites.** All are "later phase", none
block phases 1–6.

1. ~~**File uploads write no activity row.**~~ Closed: `files.remote.ts` now logs an
   `entityType: 'file'` row per upload, naming what it landed on as the parent, and the feed
   fetches those files by id.
2. **Location changes store no old/new value.** `insertActivity` is called with only
   `columnName: 'location'`, so "Moved 18 m north" is unrenderable. Needs the coordinates in
   `oldValue`/`newValue` (or `metadata`).
3. **`notified` is dead.** The debounce in `insertActivity` filters on it, but nothing in the
   codebase ever sets it, so every row stays "not yet notified" forever and the debounce window
   is effectively unbounded. Either a notification consumer is missing or the flag should go.
4. **Topo edits carry no detail.** One `columnName: 'topo'` row per save, no line count, no
   which-routes. The design's "redrew the topo, 4 lines" needs either metadata or a count read.

**From reading the design file (checked against `grnyte Activity Feed.dc.html`)**

- **Card copy beyond the verbs is not in `messages/*.json` yet.** The design also needs
  count-bearing group verbs ("added 5 photos to", "made 12 edits in", "logged a session at"),
  the sub-line pronoun form ("Tomas Kessler flashed it · Westwand"), summary lines
  ("3 ascents, 2 sends, 1 flash", "4 routes and 1 block, 15:04 to 15:24"), the chips
  ("Topo, 4 lines", "Open the block") and the quiet-card title "Crag data". Phase 3 adds them
  in the same full-sentence shape.
- **The design says "You made him an editor here".** Gendered pronoun for a member whose
  gender is not stored. Use a neutral construction when that card gets built.

**Deferred by choice**

- 1b's full-bleed photo viewer.
- Desktop refinements from the design notes: date in a sticky left gutter, expanded changes in a
  right-hand pane.
- 1c's date-range facet and per-area grouping.
- Import/volume policy: capping a several-hundred-row burst into one group.

**Settled before phase 4** (both now in §2)

- Your own activity renders inline in the global feed, the way the design shows it.
- The region chip stays hidden for a single-region user.

---

## 8. Working notes

- The worktree omits `.mcp.json` and `.vscode/*` (sandbox denies writing those paths anywhere).
  They are marked `skip-worktree`, so `git status` stays clean and they will not be committed
  as deletions.
- `node_modules`, `.env` are symlinked from the main checkout.
- `npm run dev` in the worktree would collide with the main checkout on :3000. Verification
  needs the main dev server stopped, or a different port.
