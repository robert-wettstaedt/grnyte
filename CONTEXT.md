# grnyte domain vocabulary

A private guidebook and logbook for bouldering. This file is the vocabulary guardrail:
read it before writing user-facing copy, i18n keys, or naming anything in the domain.
It records distinctions the code depends on, not a style preference.

## Hierarchy

```
region > area (nests via parentFk) > block > route > ascent
```

Every level also carries `regionFk` directly, denormalised for RLS.

## Terms

**crag**
An area of type `'crag'` (`areaTypeEnum: ['area', 'crag']`): the leaf kind that holds
blocks. A crag _is_ an area, not a separate entity, so "crag" in the UI is correct and
must not be flattened to "area". Parking needs a real crag; blocks also accept a
still-untyped area.

**block**
The entity. In prose the physical rock is a "boulder", which is correct English and used
deliberately in landing copy. Never call the record a boulder.

**route**
The entity. Bouldering colloquially says "problem"; grnyte does not. Route everywhere.

**send**
The umbrella for a successful ascent: `flash`, `redpoint` or `repeat`. Anything that is
not an `attempt`. This is what `stats.sends` counts and what the profile header means by
"Sends". It is deliberately _not_ a value in `ascentTypeEnum`, because one word cannot be
both the umbrella and one of the things under it. KAYA and 8a.nu split it the same way.
Do not reintroduce "tick" or "ticked" as a third word for this; use sent.

**redpoint**
The strict ascent type: sent it, having needed more than one go. Sits next to `flash`
(first try) and `repeat` (done it before). Borrowed from sport climbing, as every serious
bouldering logbook also does, because bouldering has no native word for it. The German
label stays "Durchstieg"; the enum value does not oblige the copy.

**community**
The people in a region. Never crew, team or squad.

## Activity feed

**activity row**
One entry in the `activities` audit log. Identified by the triple
`(entityType, type, columnName)`, which is what selects a verb, an icon and a diff
renderer. `written.ts` lists every triple the mutation layer writes today.

**actor** / **climber**
The actor did the thing (`activities.userFk`). The climber is whose ascent it is
(`ascents.createdBy`). A region maintainer may edit anyone's ascent, so a card has to say
which of the two it means: "Jonas edited Mara's ascent", never "Jonas edited an ascent".

**group**
Activity rows folded into one card. Four kinds, first match wins: **session** (one
climber's ascents in one sitting), **burst** (one editor's crag edits in one place, close
in time), **entity** (anyone's edits to the same entity, close in time) and **single**.
None of them is a stored entity, they exist only for the feed.

**verb**
The message key a group's headline resolves to. Each key holds a _whole sentence_ with
`{actor}` and `{name}` placeholders, never a verb fragment: German puts the participle
after the object ("hat die Route Rampe hinzugefügt"), which a fixed markup order cannot
express. `Message.svelte` splits the resolved sentence to render the placeholders.

**card view**
What a card says, computed before any markup: the headline key and its parts, the summary,
the rows and their state. Pure, and it returns message keys rather than resolved copy, so
it can be asserted against without asserting against a translation.

**entity ref**
The polymorphic `(entityType, entityId)` pair an activity points at. `entityId` is `text`
and the type varies, so Zero cannot join it to the entity it names.

**hydration**
Resolving entity refs to the entities themselves, client-side, in a second pass: collect
the ids per type off the synced activity rows, fetch them through the per-entity list
resources, join in memory. A ref that resolves to nothing is a tombstone (deleted); a ref
not yet in the map is a skeleton (still syncing).
