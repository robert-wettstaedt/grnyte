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

**sector**
An area of type `'sector'` (`areaTypeEnum: ['area', 'sector']`): the leaf kind that holds
blocks. A sector _is_ an area, not a separate entity, so "sector" in the UI is correct and
must not be flattened to "area". Parking needs a real sector; blocks also accept a
still-untyped area. German: `Sektor`, which is what German bouldering guidebooks print
above "Block 1 / Block 2".

Renamed from `crag` in `0128_area_type_sector.sql`. **"Crag" survives as ordinary English
prose**, exactly the split **block** (entity) and "boulder" (prose) already make below: the
tagline "Private topos for private crags" and `install_offlineBody` ("ready at the crag
with no signal") both keep it, and so does every comment about somebody physically at one.
Never call the record a crag, and never translate the prose sense into German as `Sektor`.

One entity, never a collection. Neither word may be stretched to mean the whole body of
rock data, which is the **guidebook**, below. Two identifiers did exactly that, for two
different sets, and were renamed: `notify_crag_edits` to `notify_guidebook_edits`, and
`CRAG_OBJECT_TYPES` to `BURST_OBJECT_TYPES`.

**guidebook**
The corpus describing the rock: areas, blocks, routes, topos and photos. What a printed
guidebook would contain, which is why the app calls itself "a private guidebook and
logbook": the guidebook is the rock, the logbook is your ascents. Not a synonym for
either `sector` (one area) or the offline `field` policy (which also carries your logbook
and your regions' members).

The word is deliberately English-only as a domain term: it names identifiers and concepts,
not translations. German has no crisp one-word equivalent ("Guide" reads as a person and
"Kletterführer" is a mouthful), so per-locale copy describes the thing instead of
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

**feedback**
What somebody sends about the app itself: a regression, a bug, an idea. Not about the rock
and not about another person, which is what keeps it separate from a **report**. Its kinds
(`feedbackKind: ['regression', 'bug', 'idea', 'other']`) are ordered by what a rewrite launch
actually produces, so `regression`, "this worked in the old app", comes first.

**report**
A notice that a piece of user content is illegal, under Art. 16 DSA. A different thing from
feedback in every way that matters: anyone may file one without an account, it names a piece
of content rather than the app, and answering it is a legal obligation with its own deadlines.
The two must never share a form, a table or a word. The public page is `/legal/report`; the
in-app reporting flow is not built yet.

**region stats**
A region's own numbers: how much guidebook it holds (sectors, blocks, routes, and the grades those
routes carry), how much logbook (ascents, photos, videos), who is in it, and when something last
happened. A read, never a control: the region's other screens change things, this one only counts them.

Unrelated to `ProfileStats`, which is one climber's own logbook and is what the **send** entry above
means by `stats.sends`. Neither is derivable from the other: a region counts ascent rows and route
grades, a profile counts a person's sends. Two sets, two questions, and the word "stats" alone never
says which, so name the region one in full.

Not a **guidebook** figure either. Half of what it counts is guidebook and half is logbook and
people, so it sits above both rather than under one.

## Internal terms

These name concepts in code and in prose here, never in UI copy. They are in this file so that one
word is used for each of them, not because a reader ever sees the word.

**readiness**
Whether a video can be played yet: `pending`, `ready` or `failed`, on `bunny_streams.readiness`.
Three states where the host has eleven, because no climber distinguishes queued from encoding, and
because `videos/provider.server.ts` is the seam that keeps the host's vocabulary out of the rest of
the app. Monotonic: `ready` is a one-way door, and nothing may move a video back out of it, which is
what lets a client observation correct a stale row without ever corrupting it. In UI copy the word is
"Preparing", never "processing", which is the host's word for its own machinery.

**slot**
A block's position inside its area, stored as `blocks.order` and shown 1-based, so slot 2 renders
as "Block 3" when a block has no name of its own. Per-area, so a list spanning several areas has no
slot ordering worth showing: every area has a block at slot 0. `block/order.ts` holds the rest.

**vocabulary**
The set of route tags a region has defined, stored as one key of its `settings` blob. A region's
own list, not a global one: two regions may both use the word `SD` and neither can see the other's.
A vocabulary rather than a list because it is also the allowlist a route write is checked against
(`regionTags`), so a word that is not in it cannot be stored on a route. In the UI the word is
"Tags". `settings.ts` and `tagVocabulary.ts` hold how it is read and who owns it.

## Events

How the feed stores what happened. It replaced the `activities` audit log: nothing reads that
table any more, and the vocabulary lives in `src/lib/entities/event/`.

One word means two things. **`events.verb`** is an AS2 verb, a stored value out of a closed set
(`create`, `update`, `delete`, `add`, `remove`, `join`, `leave`, `invite`, `accept`).
**Headline verb**, below, is a paraglide message key. They are unrelated, so say which you mean.

**event**
One thing that happened: an actor, a verb, and one object named by a real foreign key. One
event per mutation call, so a block reorder is one `Update` on the area and a session of
five ascents is five events. A second call on the same object within 15 minutes joins the
open event rather than opening a new one. This is the only thing in the system with a
stable id a person would recognise, which is why reactions, comments and notifications all
point at it.

**change**
One changed column under an event: the column, and what it moved between. Most events carry
no change row at all, because most of what a person does is not a diff.

**field edit**
An `update` event on an area, block, route or file: somebody changed a column on a place.
The narrowest reading of "an edit", and the only thing the feed may draw at compact tier.
Deliberately not three neighbours it keeps being merged with: the `notifyGuidebookEdits`
setting, which is broader in both directions (every verb, and everything that is not an
ascent or a person); `BURST_OBJECT_TYPES` in `grouping.ts`, which asks which objects share
a burst card and excludes files; and a `delete`, a role change or an ascent correction,
none of which are background. Three sets, three questions.

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

**actor** / **climber**
The actor did the thing (`events.actorFk`). The climber is whose ascent it is
(`ascents.createdBy`). A region maintainer may edit anyone's ascent, so a card has to say
which of the two it means: "Jonas edited Mara's ascent", never "Jonas edited an ascent".

**group**
Events folded into one card: one actor, one kind of doing, close in time. First match wins and
the kinds are `EventGroupKind` in `grouping.ts`. None is a stored entity, they exist only for
the feed.

**headline verb**
The message key a group's headline resolves to. Not `events.verb`, which is a stored AS2
value; this is copy. Each key holds a _whole sentence_ with `{actor}` and `{name}`
placeholders, never a verb fragment: German puts the participle after the object ("hat die
Route Rampe hinzugefügt"), which a fixed markup order cannot express. `Message.svelte`
splits the resolved sentence to render the placeholders.

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
Which shape a change line takes. The set is `ChangeKind` in `change.ts`; a column declares its
own in its catalogue entry in `verbs.ts`, next to its label, so a column states how it renders
where it states what it is called. A `pair` also declares the `format` its two chips read through.

**entity ref**
What a card row points at: an id plus an `EventObjectType` (`EventEntityRef` in `entity.ts`),
derived from the event's real foreign keys, never a stored polymorphic pair.

**tombstone**
A card row whose entity is gone, named off the newest line that named it. The only other row
state is `entity`: there is no pending state, because an entity arrives nested with the row
that names it.
