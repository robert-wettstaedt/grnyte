# Proposal

## Why

`events.metadata` is one text column carrying several encodings, chosen by whichever writer logged
the event: pin coordinates (`lat,long`, `~` for a rough pin), a topo change (`{action, topoId}`), a
deleted ascent's climber (`{climberFk, climberName}`), a deletion's scale (`{areas, blocks,
routes}`), or plain text (an invitee's address, a name, a role). Readers recover the meaning by
trying parsers at eight sites in five files (`line.ts`, `change.ts`, `cardView.ts`, `feed.svelte.ts`,
`digest.server.ts`), each repeating the probe. Two of them answer "is this a topo event" with
different predicates (`line.ts` within `remove`/`update`, `feed.svelte.ts` for any verb); they agree
today only because topo events are only ever written with those two verbs. Found by the
2026-10-16 code-quality review (EV-3).

## What Changes

- A new `src/lib/entities/event/metadata.ts` defines `EventMetadata`, a discriminated union (`none`,
  `coords`, `topo`, `deletedAscent`, `deletionScale`, `text`), and `decodeMetadata(raw)`, which
  runs the existing parsers once. The two JSON codecs (`parseDeletedAscent`, `parseDeletionScale`
  and their `stringify` partners) move into it from `verbs.ts` behind one shared JSON-object reader.
- `CardLine` gains a `decoded` field, set once in `line()`. The card, change, digest and
  sentence readers switch on `decoded.kind` instead of calling a parser.
- The feed's topo preload calls `decodeMetadata` on the raw event, so both topo questions read one
  decoded value.
- The raw `metadata` string stays on every event and line: it is also the grouping key, the old
  value of a `remove`, and the invitee address, none of which this change touches.

Not client-breaking: no URL, remote export, query or schema changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. A behaviour-preserving refactor, so the change sets `skip_specs: true`.

## Non-goals

- Writers recording what the column holds (a kind column or a typed jsonb), which is the root fix
  but a schema change with a backfill. This change is the read-side containment.
- Changing which events render which sentence: every reader keeps its own `objectType` and `verb`
  conditions, so a latent predicate difference becomes impossible without being "fixed" into new
  behaviour.
- The `notifications.metadata` column (a role label), which is a different column with one reader.

## Impact

- Code: `src/lib/entities/event/{metadata.ts (new), line.ts, change.ts, cardView.ts, verbs.ts,
feed.svelte.ts}`, `src/lib/entities/notification/digest.server.ts`, and the call sites of the moved
  codecs (writers in `ascent` and the entity `.remote.ts` files import them).
- Tests: `change.test.ts`, `cardView.test.ts`, `card.test.ts`, `grouping.test.ts`,
  `cases/render.test.ts` (the 217 KB render snapshot pins every card) and the digest tests.
