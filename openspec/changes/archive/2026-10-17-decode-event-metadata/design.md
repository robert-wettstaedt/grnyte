# Design

## Context

See proposal.md for the why. What decides the how:

- The parsers are pure and shape-checked, never cast: `parseCoords` (`map/coords.ts`) needs
  `[~]lat,long` with two finite numbers; `parseTopoChange` (`topo/change.ts`) a JSON object with a
  known `action`; `parseDeletedAscent` a JSON object with a numeric `climberFk` and a string
  `climberName`; `parseDeletionScale` a JSON object with at least one numeric `areas` / `blocks` /
  `routes`. No writer of a JSON shape stores another shape's keys, and coordinates are never JSON. Free text
  can (a first ascensionist's name is stored verbatim), and the decoder then answers with the first
  shape in its order; every reader's objectType or verb gate excludes those rows.
- Every reader gates its parser on context (`objectType`, `verb`), and some read the raw string for
  other purposes (grouping key, `oldValue`, invitee address). Those conditions and those raw reads
  are behaviour and stay exactly where they are.
- All card, change and digest readers receive `CardLine`s built by `line()` in `line.ts`; the digest
  builds its lines through the same `eventLines`. The feed's topo preload (`feed.svelte.ts`) works on
  `EventListItem`s and is the one reader outside lines.

## Goals / Non-Goals

**Goals:**

- One place that knows the encodings; readers ask a typed question instead of trying a parser.
- Proven equivalence: for every metadata string the event catalogue holds, the decoder's answer
  equals what each old parser returned.

**Non-Goals:**

- Context-sensitive decoding. The decoder takes the raw string only; readers keep their gates.

## Decisions

0. **Named `metadata.ts`, not `meta.ts`.** `meta.ts` already holds `metaLine` and `EventMeta.svelte`
   is a component, so the module is `metadata.ts`, the type `EventMetadata`, the function
   `decodeMetadata` and the line field `decoded`.

1. **Decode on the raw string alone.** `decodeMetadata(raw)` tries the parsers in a fixed order and
   returns the first hit, else `text` for a non-empty string, else `none`. Disjoint shapes make the
   order irrelevant to the result, which the equivalence test pins. Rejected: decoding with
   `(objectType, verb)`, which would move reader conditions into the decoder and silently change a
   reader whose gate differs from the decoder's.
2. **`decoded` beside `metadata`, not instead of it.** `CardLine.decoded` is set in `line()`; `metadata`
   stays for the grouping key, `oldValue` and the invitee and revoked-invitation address.
3. **The JSON codecs move to `metadata.ts`.** `parseDeletedAscent`, `parseDeletionScale`,
   `stringifyDeletedAscent` and `stringifyDeletionScale` leave `verbs.ts` (the sentence catalogue)
   for the module that owns the encodings, sharing one `parseJsonObject`. `parseTopoChange` and
   `parseCoords` stay with their owners (`topo/change.ts`, `map/coords.ts`) and are called from the
   decoder.
4. **Readers switch, conditions stay.** For example `columnFor` keeps `verb === 'remove' &&
objectType === 'block'` and asks `decoded.kind === 'topo'`; `deletionScaleParts` keeps
   `verb === 'delete'` and reads `decoded.kind === 'deletionScale' ? decoded.scale : undefined`.

## Risks / Trade-offs

- [A string the catalogue does not contain decodes differently than its old parser] → the
  equivalence test also covers hand-picked edge strings (empty, whitespace, `~`, malformed JSON,
  JSON arrays and scalars, an object matching no shape, coordinate-looking names).
- [A card renders differently] → `cases/render.test.ts`'s snapshot must come out byte-identical.
- [`CardLine` fixtures built by hand without `decoded`] → `decoded` is required on the type, so every
  fixture that builds a line fails to compile until it goes through `line()` or sets it.

## Migration Plan

None: read-side only, no data or contract change. Rollback is reverting the commit.
