## Why

In-app back returns readers into screens they have already finished with. Log an ascent, save, land
back on the route, press back: the Log ascent form reopens. The history stack is not lying, it is
reporting what the app did. Every exit in the app **pushes** a new entry rather than retiring the
completed one, so the finished task is still sitting there behind the destination.

It is not four bad call sites. The four hand-rolled `goto` calls in `onSubmitted` are the smallest
of three exit mechanisms; the dominant one is a single line in `authedForm` that 22 handlers reach
through. That is why the same shape shows up everywhere a task ends: closing an explore sheet,
saving any form, leaving a screen after a delete. It is also why the fix can be small: the exits are
already funnelled, they are just funnelled into a push.

## What Changes

- **Finishing a task retires its screen.** When a task ends, the screen that hosted it stops being
  somewhere back can reach. Either the app returns to the entry it came from, or it replaces the
  finished screen with the destination. It never leaves both in the stack.
- **The rule holds for the browser and OS back too**, not only the header chip. Swipe back, the
  Android hardware button and `Cmd+[` read the same stack, so the stack is what gets repaired. A
  chip that disagreed with the swipe on the same screen would be a worse defect than the one being
  fixed.
- **One exit rule, one place.** The three mechanisms collapse onto one client-side exit that decides
  pop or replace. `runCommand` stops pushing, which covers every delete and undo path. The two
  explore sheets stop pushing, so closing one no longer leaves it reachable by back.
- **The destination keeps being declared by the handler.** `MutationResult.redirectTo` already
  carries it, computed server-side where a newly created id exists. Two handlers that currently
  withhold it (`createRoute`, `createAscent`) start declaring it, because the client ordering they
  were hand-rolling is now provided.
- **`Form` owns the exit.** It gains a cancel destination and performs the exit itself. `onSubmitted`
  goes back to its documented job, acting on the result, and stops navigating.
- **Raw `goto` becomes a lint error outside the navigation module**, which re-exports a pass-through
  for the forward pushes that are legitimate (opening a sheet from the map, from search, from
  create-on-map). The rule this replaces was written in a doc comment and drifted in four places.
- **The multi-step form gets an unsaved-changes guard**, because its chip steps backwards while the
  swipe abandons the whole form. The guard covers both, so leaving is a choice rather than silent
  loss. This introduces user-facing copy and therefore an i18n key in both locales.
- **BREAKING, staged: the server-side `redirect(303)` in `authedForm` is removed.** Not in the first
  release. See the client-breaking note under Impact.

## Non-goals

- **Redefining back as "go up one level."** Rejected: it would make the chip disagree with the swipe
  and the hardware button, which read history and cannot be redirected.
- **Entries that point at deleted rows.** Back can still land on a screen whose entity was deleted
  later. Deletes here are undoable, so during the undo window that entry is legitimate, and a
  concurrent delete by someone else makes a "gone" state mandatory regardless. The one requirement
  kept is that a delete exit must not leave the dead screen as the top entry.
- **Making wizard steps real history entries.** One two-step form exists. Doing it would drag in
  multi-entry traversal that this change deliberately avoids, and the step count is wrong after a
  reload anyway.
- **Adopting the Navigation API.** It is exactly this feature and would delete the mirror outright,
  but it reached all engines only in Safari 26.2 and Firefox 147, far above the pinned browser floor.
  No polyfill can close the gap, because the History API cannot read another entry's URL. A trip-wire
  comment records the versions at which this becomes possible.
- **Surviving a reload mid-task.** Reloading part-way through a task loses what the app knows about
  the entry behind it, and the exit falls back to replace. The cost is one back press that appears to
  do nothing, on a path that already loses in-flight uploads.
- **Auth and onboarding exits.** Sign-in redirects server-side on a path this change does not touch.
  Whether it pushes is listed as a verification item, not as scope. Region creation deliberately
  performs a full document load, which history mechanics do not apply to, and stays as it is.

## Capabilities

### New Capabilities

- `navigation/back-navigation`: what back means inside the app, what finishing a task does to the
  history stack, and where back goes when there is nothing behind the current screen.

### Modified Capabilities

None. No capability specs exist yet under `openspec/specs/`.

## Impact

**Code.** `src/lib/state/navigation.svelte.ts` (the mirror, the exit decision, the pass-through),
`src/lib/forms/Form.svelte` (cancel destination, the exit, the interception),
`src/lib/remote/mutation.ts` (`runCommand`), `src/lib/remote/authed.server.ts` (the 303, in the
later release), `eslint.config.js`, and the `build.target` comment in `vite.config.ts`.

**Entity modules.** `entities/route` and `entities/ascent`, where `createRoute` and `createAscent`
begin declaring `redirectTo`. No other handler changes; the other 22 keep the envelope they have.

**Routes.** 18 form screens swap `onCancel` for a cancel destination. The four pages that navigate by
hand drop their `goto`. Two explore sheets change how they close. The parking wizard gains the guard.
No route is added, removed or reshaped, so no bookmark, share link or push target breaks.

**Tables.** None. No schema change, no migration, no backfill.

**i18n.** One new key pair for the unsaved-changes confirm, in `messages/en.json` and
`messages/de.json`.

**Client-breaking, and what already-loaded tabs do.** No remote function export is renamed and no
`.remote.ts` file moves, so no endpoint id changes and no open tab starts 404ing. The breaking part
is the later removal of the 303: the moment the server stops redirecting, a tab still running the
old `Form` saves successfully and then does not navigate, which reads as a failed save and invites a
second Save. `createArea` refuses a duplicate by name, but logging the same ascent twice is
legitimate, so that tab produces duplicate data rather than an error. This is why the removal is a
separate, later release rather than part of the first one: the first release fixes back navigation
without any server change, so the removal carries no deadline and can wait until stale tabs have
cycled out through the service worker.
