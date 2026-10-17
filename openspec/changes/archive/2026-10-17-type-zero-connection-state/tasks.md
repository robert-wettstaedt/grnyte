# Tasks

## 1. Vocabulary

- [x] 1.1 Create `src/lib/zero/connection.ts` with `ConnectionName` (from Zero's `ConnectionState`),
      `TERMINAL`, `isTerminal(name)` and `RECONNECT_HOLD_MS = 10_000`.

## 2. Readers

- [x] 2.1 `state/online.svelte.ts`: drop its `TERMINAL` and `UNREACHABLE_HOLD_MS`, use `isTerminal`
      and `RECONNECT_HOLD_MS`, and type `connectionVerdict`, `reportConnectionState`,
      `shouldTightenPing`, `applyConnectionState`, `currentConnectionState` and `reported` as
      `ConnectionName`.
- [x] 2.2 `components/StatusBar/statusBar.ts` and `StatusBar.svelte`: drop `TERMINAL` and
      `TRANSIENT_HOLD_MS`, use `isTerminal` and `RECONNECT_HOLD_MS`, and type `resolveStatus`'s
      `connection`, the `connectionState` prop and `settled` as `ConnectionName`.
- [x] 2.3 `state/global.svelte.ts`: drop `TERMINAL_CONNECTION`, use `isTerminal`.
- [x] 2.4 `zero/authRecovery.ts` (`authRetryDelay`) and `zero/z.svelte.ts` (`lastState`,
      `noteConnectionForResume`): type the state as `ConnectionName`.
- [x] 2.5 Confirm by grep that no `'closed', 'error', 'needs-auth'` list and no `name: string`
      connection parameter is left outside `connection.ts`.

## 3. Verification sweep

- [x] 3.1 Over the touched paths: `npx prettier --write`, `npx eslint`,
      `npx vitest run --project browser` for the four connection tests, and `svelte-check` (beside a
      running dev server, per AGENTS.md).
- [x] 3.2 `npm run lint:duplication` and `npm run lint:unused`.
- [x] 3.3 Drive the app at 375x667 and 1280x800: the status bar stays hidden on a healthy
      connection and the app reads as online; with the browser offline the "offline" bar appears
      (at once: the browser flag is not held, only Zero's state is). Check the `StatusBar` stories (Offline, Reconnecting, Not syncing, Update ready)
      still render.
