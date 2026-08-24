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

One entity, never a collection. "Crag" must not be stretched to mean the whole body of
rock data — that is the **guidebook**, below. `notify_crag_edits` and `CRAG_OBJECT_TYPES`
both did exactly that, for two different sets, and were renamed.

**guidebook**
The corpus describing the rock: areas, blocks, routes, topos and photos. What a printed
guidebook would contain, which is why the app calls itself "a private guidebook and
logbook" — the guidebook is the crag, the logbook is your ascents. Not a synonym for
either `crag` (one area) or the offline `field` policy (which also carries your logbook
and your regions' members).

The word is deliberately English-only as a domain term: it names identifiers and concepts,
not translations. German has no crisp one-word equivalent — "Guide" reads as a person and
"Kletterführer" is a mouthful — so per-locale copy describes the thing instead of
translating the noun. Copy is not settled yet; do not derive UI wording from this entry.

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

**session**
One visit: a climber, a route, a day. One `ascents` row per route per day is what the app
expects and what a climber logs, because the row already means "I went, and this is how it
ended". Nobody records three rows on one route in one afternoon to mean "it took me three
goes", so a count of rows is a count of visits, not of tries. Rows that do share a route and
a day are a mistake, and anything counting sessions folds them into one rather than inflating
the total (`countSessions` in `projects.ts`, `groupSessions` in `sessions.ts`). This is also
why a route worked and sent inside one day is not a project: projecting means going back.

**accolade**
The one claim a send's card may make, at most one, chosen by the system and never
customisable: `project` (the send ended a run of failed sessions) or `ceiling` (the hardest
of its kind in twelve months). For the ceiling there are two pools, not four types: a `flash`
competes only with flashes, while a `redpoint` and a `repeat` compete with each other,
because both are climbs that were worked. A repeat given a pool of its own is trivially its
own record, which is what the split exists to prevent. An `attempt` has no pool and is never
evidence about anybody's ceiling.

**community**
The people in a region. Never crew, team or squad.

## Events

The layer replacing the activity feed's storage. It is being built module by module, so until it
lands the terms under "Activity feed" below are still the ones the code uses; the ones marked
_retiring_ are what it replaces.

Note the one word that means two things during the transition. **`events.verb`** is an AS2
verb, a stored value out of a closed set (`create`, `update`, `delete`, `add`, `remove`,
`join`, `leave`, `invite`, `accept`). **Headline verb**, below, is a paraglide message key.
They are unrelated, so say which one you mean until the module rename retires the ambiguity.

**event**
One thing that happened: an actor, a verb, and one object named by a real foreign key. One
event per mutation call, so a block reorder is one `Update` on the area and a session of
five ascents is five events. A second call on the same object within 15 minutes joins the
open event rather than opening a new one. This is the only thing in the system with a
stable id a person would recognise, which is why reactions, comments and notifications all
point at it.

**change**
One changed column under an event: the column, and what it moved between. This is the
`activities` table minus everything that was really about the action rather than the diff.
Roughly 90% of today's activity rows carry no diff at all and become events with no change
row under them.

**field edit**
An `update` event on an area, block, route or file: somebody changed a column on a place.
The narrowest reading of "an edit", and the only thing the feed may draw at compact tier.
Deliberately not three neighbours it keeps being merged with: the `notifyCragEdits` setting,
which users read as "Crag edits" and which is broader in both directions (every verb, and
everything that is not an ascent or a person); `CRAG_OBJECT_TYPES` in `grouping.ts`, which
asks which objects share a burst card and excludes files; and a `delete`, a role change or an
ascent correction, none of which are background. Three sets, three questions.

**reaction**
A row in `reactions`, which holds **both** emoji and comments, discriminated by `type`. The
code name is deliberately wider than the UI word: in the interface "Reactions" means only
the emoji half, and comments are "Comments". Do not assume `event.reactions` is the emoji
bar. Stream's vocabulary, and the shape is what lets a reaction target a comment through
one foreign key instead of a polymorphic pair.

**target**
What a reaction hangs off: the event, or one comment under it (`parent_fk`). One emoji per person
per target, which is what `reactions_one_emoji_idx` spells as `coalesce(parent_fk, 0)`, so a reader
holds one on the card and one more on each comment. The unit the toggle guards against a double tap
is the target, never the emoji.

**reply**
A comment with a `parent_fk`. One level only: answering a reply files under that reply's own
parent, so a thread is a list of comments each with a flat list of answers, never a tree.
"Reply" is the UI word too.

**subscriber**
Who hears about a comment: the event's actor, plus every distinct author of a comment on
it, minus whoever is writing. Derived at fan-out, never stored. A reply notifies the whole
thread, not only the parent's author, but each person gets exactly one row and the most
specific sentence they qualify for: answered, then named, then the plain thread line.

## Activity feed

**activity row** _(retiring)_
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

**headline verb** _(retiring as a bare "verb")_
The message key a group's headline resolves to. Not `events.verb`, which is a stored AS2
value; this is copy. Each key holds a _whole sentence_ with
`{actor}` and `{name}` placeholders, never a verb fragment: German puts the participle
after the object ("hat die Route Rampe hinzugefügt"), which a fixed markup order cannot
express. `Message.svelte` splits the resolved sentence to render the placeholders.

**card view**
What a card says, computed before any markup: the headline key and its parts, the summary,
the rows and their state. Pure, and it returns message keys rather than resolved copy, so
it can be asserted against without asserting against a translation.

**change line**
One changed column as the expanded half of a card renders it: an icon, a label, and what the
column moved between. Decided by `change.ts` under the same contract as the card view (keys and
raw values, never resolved copy and never a formatted string), because the unit, the locale and
the grading scale belong to whoever is reading.

**change kind**
Which of the ten shapes a change line takes (`pair`, `chips`, `tags`, `grade`, `rating`,
`prose`, `location`, `topo`, `source`, `file`). Declared by the column's catalogue entry in
`verbs.ts`, next to its label, so a column states how it renders where it states what it is
called. A `pair` also declares the `format` its two chips read through.

**entity ref** _(retiring)_
The polymorphic `(entityType, entityId)` pair an activity points at. `entityId` is `text`
and the type varies, so Zero cannot join it to the entity it names. An event names its
object with a real foreign key instead, one nullable column per type with a CHECK that
exactly one is set.

**hydration** _(retiring)_
Resolving entity refs to the entities themselves, client-side, in a second pass: collect
the ids per type off the synced activity rows, fetch them through the per-entity list
resources, join in memory. A ref that resolves to nothing is a tombstone (deleted); a ref
not yet in the map is a skeleton (still syncing). With real keys the entity arrives nested
in the same query, so all three states collapse to one: the relation is there, or the row
is soft-deleted and can still be named.
