# Design

## Context

See proposal.md for the why. What decides the how:

- `@rocicorp/zero` exports `ConnectionState`, a union discriminated on `name`; the app only ever
  reads `name`, so `ConnectionState['name']` is the whole contract.
- `TERMINAL` has three readers that agree on the list and disagree on what to do about it:
  `StatusBar` shows a red "not syncing" bar, `online.svelte.ts` treats `needs-auth` as proof of a
  network and the other two as no evidence, and `global.svelte.ts` calls an empty replica cold.
- The two holds are different rules over one constant:
  - `StatusBar` holds EVERY non-connected state before showing it: 3 s for a terminal state, 10 s
    for a transient one, restarted on every change.
  - `online.svelte.ts` holds only an `unreachable` verdict, edge-triggered, and drops it when the
    tab is hidden; terminal states never start it.

## Goals / Non-Goals

**Goals:**

- One definition of the state names, the terminal list and the shared 10 s hold.
- A misspelled state name is a compile error.

**Non-Goals:**

- Merging the two holds into one held state. Doing it would either delay the red bar by 10 s (if
  the bar read the network hold) or make the app call itself offline on a terminal state (if the
  network read the bar's hold). Both change user-visible behaviour.

## Decisions

1. **`zero/connection.ts` holds the vocabulary only.** Types, the list, the guard and the constant;
   no state and no imports beyond the type, so `online.svelte.ts` and `statusBar.ts` can both depend
   on it without a cycle through `z.svelte.ts`.
2. **`isTerminal(name)` rather than an exported array to `.includes` on.** The typed array's
   `includes` would refuse a wider `string` argument anyway, and every reader asks the same yes/no
   question.
3. **One hold constant, not one hold.** `RECONNECT_HOLD_MS` replaces `StatusBar`'s
   `TRANSIENT_HOLD_MS` and `online.svelte.ts`'s `UNREACHABLE_HOLD_MS`, which is the equality the
   comment asked to be kept. `StatusBar`'s 3 s terminal hold stays local; nothing else shares it.
4. **The story keeps its props.** `StatusBar.stories.svelte` passes `{ name: '...' }` literals,
   which type-check against `ConnectionName` unchanged.

## Risks / Trade-offs

- [A reader's behaviour changes while being retyped] → no comparison, branch or duration changes;
  the existing tests (`statusBar.test.ts`, `offlineRules.test.ts`, `onlineHold.test.ts`,
  `authRecovery.test.ts`) must pass unchanged apart from `as const` on literal lists.
- [Zero widens its union in an upgrade] → a new name is then a compile error at every exhaustive
  switch and is otherwise treated as non-connected, which is the current behaviour for an unknown
  string.

## Migration Plan

None: read-side typing and constants only. Rollback is reverting the commit.
