## 1. Remove wasted query registrations

Ships before any measurement, so the baseline has a clean floor.

- [x] 1.1 Debounce the search input so a keystroke does not register a new Zero query per stroke, and
      verify with the prod-style inspector table (or the dev equivalent) that typing a word produces
      one registration per settled term rather than one per character
- [x] 1.2 Gate `usersByIds` with `enabled` so it does not register when its id list is empty, and
      verify the query no longer appears in the inspector table on a page where no ids resolve
- [x] 1.3 Gate `blockTopos` with `enabled` so it does not register when its block id list is empty,
      verified the same way
- [x] 1.4 Add a relation-free notification query variant in `src/lib/entities/notification/`
      (queries, dto, resource) and point the unread badge at it, keeping the existing query for the
      inbox screen, and verify the badge still renders the same number while the inspector shows the
      bare-row query in its place

## 2. Baseline measurement

- [ ] 2.1 Record the current `ZERO_NUM_SYNC_WORKERS` value from Bitwarden into the change notes, and
      verify it is written down before any deploy so the later numbers can be read against it
- [ ] 2.2 Capture a cold feed-page baseline on production: time from navigation to the last query
      reporting got, plus the full inspector table, and verify the capture is saved somewhere
      durable rather than pasted into a terminal
- [ ] 2.3 Capture the same on a warm back-navigation to the feed, and verify both captures are from
      the same account and page so step 4 has a comparable pair

## 3. Relocate the client view records

- [ ] 3.1 Add a Postgres container with a named volume beside zero-cache in
      `deployment/docker-compose.zero.yml` and `docker-compose.yml`, and verify it starts and
      accepts a connection locally before any production change
- [ ] 3.2 Create the `ZERO_CVR_DB` secret in Bitwarden and add its mapping to
      `.github/workflows/deploy-zero.yml` for the production environment, and verify the workflow
      resolves it by running the deploy against the non-production environment first
- [ ] 3.3 Document the variable in `deployment/README.md`, including the explicit reason the
      database is not backed up, and verify the note names `backup-db.yml` so a future maintainer
      finds the rationale where they would look
- [ ] 3.4 Deploy the cutover at low traffic, leaving the previous database untouched, and verify by
      loading the app that clients re-sync and reach a working state
- [ ] 3.5 Re-measure the feed page cold and warm exactly as in task 2, and verify the pair is
      recorded beside the baseline

## 4. Recent query retention

- [ ] 4.1 Set `maxRecentQueries` to 20 in the Zero client options in `src/lib/zero/z.svelte.ts`, and
      verify the inspector shows queries surviving a back-navigation rather than re-registering
- [ ] 4.2 Re-measure the feed page cold and warm, and verify the warm back-navigation improved and
      the feed did not regress
- [ ] 4.3 Record the gate outcome in the change notes: whether steps 3 and 4 moved the numbers, and
      therefore whether the deferred structural items are triggered, verified by the recorded
      measurements rather than impression

## 5. The readiness signal

Independent of tasks 1 to 4 and may land in parallel on its own branch.

- [ ] 5.1 Add the latched readiness member to `QueryResource` in `src/lib/zero/resource.svelte.ts`,
      keyed on the query hash and never cleared, and verify with a unit test that it stays true
      after the underlying completeness flag goes false
- [ ] 5.2 Rename the strict server-confirmed member and comment it as the form-seeding and
      fingerprint signal only, and verify the rename compiles with no remaining references to the
      old name
- [ ] 5.3 Point the four `known` fingerprint call sites (`updateRoute`, `updateBlock`,
      `saveTopoLines`, `updateRegionMapLayers` and their forms) at the renamed strict member, and
      verify `e2e/form-seeding.spec.ts` still passes
- [ ] 5.4 Redefine `isEmpty` as settled-and-empty, and verify with a unit test that an unconfirmed
      empty result no longer reports empty
- [ ] 5.5 Implement the new member in `src/lib/components/QueryState/remoteResource.ts` so it still
      satisfies the interface, and verify `remoteResource.test.ts` passes
- [ ] 5.6 Add the `syncing` snippet and its default branch to
      `src/lib/components/QueryState/QueryState.svelte`, gated on reduced motion per AGENTS.md, and
      verify via the existing `forceState` override that the branch renders
- [ ] 5.7 Add i18n keys for the default readiness copy to BOTH `messages/en.json` and
      `messages/de.json`, sorted and under one domain prefix, and verify no key exists in one file
      only
- [ ] 5.8 Add the syncing state to `QueryState`'s Storybook stories, and verify it renders in
      `npm run storybook` in both light and dark

## 6. Call sites

- [ ] 6.1 Sweep every `QueryResource` consumer for sites matching the known wrong patterns, not only
      the two already found, and verify by recording the resulting list with file and line in the
      change notes before any fix is made
- [ ] 6.2 Fix `src/routes/(app)/routes/[id]/+page.svelte` so a loading ascents query no longer
      renders an offline notice, and verify by driving the page against a throttled connection that
      it shows the readiness affordance and then the data
- [ ] 6.3 Fix `src/routes/(app)/routes/[id]/ascents/+page.svelte` the same way, and verify the filter
      chips and header tally are no longer hidden while merely loading
- [ ] 6.4 Fix any further sites the sweep in 6.1 found, one reviewable edit each, and verify each
      against the list recorded there

## 7. Vocabulary and regression cover

- [ ] 7.1 Extend `src/lib/zero/availability.test.ts` (or its current equivalent) to cover the
      readiness states, and verify each new test has been seen red by inverting one branch of
      `resolveAvailability` before relying on it
- [ ] 7.2 Name the readiness states in `CONTEXT.md`, and verify the terms used in code, copy and
      spec match what is written there

## 8. Verification sweep

Over the touched paths and nothing else, per AGENTS.md.

- [ ] 8.1 Run `npx prettier --write` and `npx eslint` over the touched paths, and verify both exit
      clean
- [ ] 8.2 Run `npx vitest run --project server` for `*.server.test.ts` and `*.remote.test.ts` and
      `--project browser` for the rest, and verify both pass
- [ ] 8.3 Typecheck with `./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json` beside the
      running dev server, and verify it reports no new errors
- [ ] 8.4 Run `npm run lint:duplication` and `npm run lint:unused`, and verify no clone is marked
      NEW and nothing unused was introduced
- [ ] 8.5 Drive the running app at BOTH 375x667 and 1280x800 across a list surface, a detail page
      and an empty state on a throttled connection, and verify the three readiness conditions are
      visually distinguishable at both sizes
