> **Execution order: 9 with 11, then 1, 10, 2, 3, 4, then 5 to 7 in parallel, 8 last.**
>
> Group numbers are the order these were written, not the order they run. They are kept as they are
> so the completed boxes in groups 1 and 2 stay meaningful. The order above follows the migration
> plan in design.md, which was revised once measurement separated four problems rather than one.

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

- [x] 2.1 Record the current `ZERO_NUM_SYNC_WORKERS` value from Bitwarden into the change notes, and
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

PRECONDITION, established in group 10 and written up in design.md: nothing de-registers a query
within a page's life, and `maxRecentQueries` only evicts queries that HAVE been released. Until the
deferred resource-lifetime item lands, this group can only measure a no-op. Do not read a flat
result as "the lever did not help".

- [ ] 4.1 Confirm the precondition still holds before changing anything: walk three screens and
      verify the inspector's query count only grows. If it now falls when a screen is left, the
      deferred item has landed and the rest of this group is worth running
- [ ] 4.2 Set `maxRecentQueries` to 20 in the Zero client options in `src/lib/zero/z.svelte.ts`, and
      verify the inspector shows queries surviving a back-navigation rather than re-registering
- [ ] 4.3 Re-measure the feed page cold and warm, and verify the warm back-navigation improved and
      the feed did not regress
- [ ] 4.4 Record the gate outcome in the change notes: whether steps 3 and 4 moved the numbers, and
      therefore whether the deferred structural items are triggered, verified by the recorded
      measurements rather than impression. If 4.1 showed the precondition still holds, record that
      step 4 measured a no-op by construction rather than a lever that did not work

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

## 9. Resume latency (problem A)

Runs FIRST. Client-side only, no deploy coupling, and it targets the complaint that prompted this
change. See design.md, "Tighten the ping timeout on evidence, rather than globally".

- [x] 9.1 In `src/lib/state/online.svelte.ts`, expose the condition that means "the network answers
      but Zero still believes it is connected", from the reachability probe already running on
      resume, and verify with a unit test over the pure inputs rather than by driving a socket
- [x] 9.2 Tighten `pingTimeoutMs` on the live client while that condition holds and restore Zero's
      default once the connection is re-established, in `src/lib/zero/z.svelte.ts`, and verify by
      typecheck that the property still exists on the client (an upgrade removing it must fail the
      build, not silently no-op)
- [x] 9.3 Prove the behavior end to end: with the app open, kill the socket without closing it
      (DevTools offline toggle leaves the client believing it is connected), restore the network,
      and verify new rows arrive in roughly `2 x` the tightened value rather than 10 seconds
- [x] 9.4 Confirm the steady-state path is untouched: with no resume and no failed probe, verify the
      client still reports Zero's default so behavior on a weak connection is unchanged
- [ ] 9.5 File the behavior upstream at bugs.rocicorp.dev, since no existing issue covers it and
      the option is undocumented, and record the issue link in the change notes

## 10. Why the map queries register on the feed (problem B)

Diagnostic, and it runs BEFORE any decision about the map. Cheap to answer and it may remove most of
the 2938 ms without an architectural change.

- [x] 10.1 Establish why `listBlocks({})`, `listAreas({})` and `listRoutesForMap({})` are registered
      on `/feed` rather than only on `/explore`, and verify the answer by naming the component or
      layout that reads them there, with file and line
- [x] 10.2 Record in the change notes whether the fix is scoping (a surface staying mounted across
      the shell) or architectural (the map genuinely needs Zero), and verify the recommendation
      against a measured feed capture rather than reasoning alone
- [x] 10.3 NOT APPLICABLE, and left here rather than deleted so the reason survives. Its precondition
      was "only if 10.2 says scoping". It does not: the feed never registered those queries, so there
      is nothing on it to scope. What 10.2 found instead is deferred, see design.md

## 11. Device-local resume diagnostics (problem A)

Runs with group 9, since it is how 9's fix is judged on real hardware. Temporary instrumentation for
a gate decision, so it is written to be removed in one commit. Nothing leaves the device.

- [x] 11.1 Add a capped ring buffer in `localStorage` recording only resumes that needed a
      reconnect, with the append and eviction as a pure function, and verify with a unit test that
      the cap holds and the oldest entry is the one dropped
- [x] 11.2 Record an entry from the reconnect path added in group 9, so a resume that did NOT need
      one writes nothing, and verify by driving the app that a healthy resume leaves the buffer
      untouched while a killed socket adds exactly one entry
- [x] 11.3 Handle `localStorage` being unavailable or throwing (private windows, blocked site data)
      so a diagnostic can never break the app, and verify with a unit test that a throwing store is
      swallowed
- [x] 11.4 Add a "this device" section to `src/routes/(app)/settings/errors/+page.svelte` rendering
      the buffer newest first with a clear action, and verify by driving the page at BOTH 375x667
      and 1280x800 that it reads correctly and that an empty buffer renders an empty state rather
      than a blank panel
- [x] 11.5 Add the section's copy to BOTH `messages/en.json` and `messages/de.json`, sorted and
      under one domain prefix, and verify no key exists in only one file
- [x] 11.6 Record the removal trip-wire in the change notes: what to delete, and that it goes once
      the gate in 4.4 is decided, verified by the note naming the files rather than describing them
