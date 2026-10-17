# Proposal

## Why

Zero reports its connection as a closed union (`ConnectionState['name']`: `connecting`,
`connected`, `disconnected`, `needs-auth`, `error`, `closed`), and the app reads it as a plain
`string` in five modules: `state/online.svelte.ts`, `components/StatusBar/` (`statusBar.ts` and the
component), `state/global.svelte.ts`, `zero/authRecovery.ts` and `zero/z.svelte.ts`. Every
comparison is against a literal no compiler checks, so a misspelled state reads as "not connected"
forever. The list of terminal states (`closed`, `error`, `needs-auth`) is written out three times,
and `global.svelte.ts` says in a comment that it is the "same list as StatusBar's and
online.svelte's". The 10 s hold that `StatusBar` and `online.svelte.ts` must agree on is two
separate constants, which `online.svelte.ts` says it keeps equal "on purpose". Found by the
2026-10-16 code-quality review (FW-4).

## What Changes

- A new `src/lib/zero/connection.ts` exports `ConnectionName` (Zero's own
  `ConnectionState['name']`), `isTerminal(name)` over the one terminal list it keeps private, and the one
  `RECONNECT_HOLD_MS` both holds read.
- The three `TERMINAL` copies go, and their readers call `isTerminal`.
- Every parameter, field and prop that carries a connection state name is typed `ConnectionName`
  instead of `string`: `connectionVerdict`, `reportConnectionState`, `shouldTightenPing`,
  `resolveStatus`, `authRetryDelay`, `noteConnectionForResume`, `StatusBar`'s props and `settled`
  state, and the module state in `online.svelte.ts` and `z.svelte.ts`.
- `StatusBar`'s transient hold and `online.svelte.ts`'s unreachable hold both read
  `RECONNECT_HOLD_MS`.

Not client-breaking: no URL, remote export, query or schema changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. A behaviour-preserving refactor, so the change sets `skip_specs: true`.

## Non-goals

- One reactive "held" connection shared by `StatusBar` and `online.svelte.ts`, which the review
  suggested. The two holds are different rules (see design.md), and merging them would change what
  the status bar shows and when the app calls itself offline.
- Changing any hold duration, any state's verdict, or any copy.

## Impact

- Code: `src/lib/zero/{connection.ts (new), authRecovery.ts, z.svelte.ts}`,
  `src/lib/state/{online.svelte.ts, global.svelte.ts}`,
  `src/lib/components/StatusBar/{statusBar.ts, StatusBar.svelte}`.
- Tests: `statusBar.test.ts`, `offlineRules.test.ts`, `onlineHold.test.ts`, `authRecovery.test.ts`
  (literal state names only; any list of states built as `string[]` needs `as const`).
