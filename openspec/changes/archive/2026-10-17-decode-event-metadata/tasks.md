# Tasks

## 1. Decoder, proven first

- [x] 1.1 Create `src/lib/entities/event/metadata.ts` with `EventMetadata`, `decodeMetadata` and the two JSON
      codecs moved from `verbs.ts` behind one `parseJsonObject`; repoint their importers (the ascent, area and
      block `.remote.ts` writers, the `cases/` catalogue and `verbs.test.ts`); verify with svelte-check.
- [x] 1.2 Add `metadata.test.ts`: for every metadata string in the `cases/` catalogue plus hand-picked
      edge strings, the decoder's answer equals each old parser's result; seen red once (by
      answering `text` where the decoder found a deletion scale).

## 2. Readers

- [x] 2.1 Add a required `decoded` to `CardLine`, set in `line()`; repoint `columnFor`'s parser calls
      to it, keeping every `objectType` / `verb` gate (`storedValue` reads the raw string and is untouched).
- [x] 2.2 Repoint `change.ts` (topo change), `cardView.ts` (deleted ascent, deletion scale) and
      `digest.server.ts` (deleted ascent) to `decoded`.
- [x] 2.3 Repoint `feed.svelte.ts`'s topo preload to `decodeMetadata`.
- [x] 2.4 Confirm no parser call is left outside `metadata.ts` (grep), and that `cases/render.test.ts`
      passes with its snapshot unchanged.

## 3. Verification sweep

- [x] 3.1 Over the touched paths: `npx prettier --write`, `npx eslint`, `npx vitest run` (browser
      project for the event module, server project for the digest), and `svelte-check` (beside a
      running dev server, per AGENTS.md).
- [x] 3.2 `npm run lint:duplication` and `npm run lint:unused`.
- [x] 3.3 Drive the feed at 375x667 and 1280x800: a topo edit card expands with its photo, a deleted
      ascent names its climber, an area deletion shows its scale, a cleared parking and a cleared
      block pin read as such, an invitation and its revocation name the address.
