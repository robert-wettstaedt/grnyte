# Proposal

## Why

Every write goes through a SvelteKit remote function, which only the web app can call. The planned
Expo app needs the same writes, and Zero custom mutators give both clients one write path that also
applies instantly to the local store. The spike on `feature/zero-mutators` proved the server half
(RLS inside Zero's transaction, refusals, no resend loop) and found that Kit's remote forms cannot
hold our fields or show a mutator's field errors, so the form layer has to move as well.

## What Changes

- Every authed database write becomes a Zero custom mutator, with a client half (optimistic or
  none) and a server half run by `/api/zero/mutate` inside the RLS transaction.
- Toggles (favorite, reaction, visibility, settings) apply instantly and revert with a toast on
  refusal. Forms, creates and deletes wait for the server's answer. Creates read the new id, and
  deletes read their undo snapshot, from the mutator's return value.
- Writes that need the privileged handle (`createRegion`, `acceptRegionInvitation`,
  `acceptMyInvitation`, `subscribeToPush`, `submitFeedback`) run as explicitly privileged mutators
  in the same transaction, each still naming its permission gate.
- Side effects outside the database (mention and member notifications, push, invitation email,
  storage teardown) run after commit and carry an idempotency key, so a resent mutation never
  notifies or mails twice. The invitation email moves out of the open transaction, where a
  rollback after the send still mails today.
- An invitation records whether its email was accepted for delivery (`last_delivered_at`, beside
  the existing `last_sent_at` attempt time). The invitation row shows "not delivered" instead of
  the post-invite toast choosing between sent and not sent.
- A store-backed form layer replaces Kit remote forms on every migrated form: values in component
  state, validation from the entity's zod schema, field issues set from the server's refusal.
- Removed once the last caller moves: `Form.svelte`'s remote-form path,
  `seedForm` / `seedOnKeyChange`, `submitForm`, `isOfflineFailure`, the entity forms' use of
  `RemoteFormInputWrapper`, and the remote-form conventions in AGENTS.md. Kit remote forms remain
  only on the auth pages.
- Writes are refused while Zero is not connected, as today; nothing is queued offline.
- The `/f/<id>` share page keeps `setFileVisibility` and `deleteFile` as remote functions for good:
  it renders outside the `(app)` layout, so it has no Zero client to write through.
- `acceptRegionInvitation` stays a remote function for good, for the same reason: `/invite/accept`
  renders outside `(app)`. The in-app accept on the settings page moves to a mutator.
- The remote functions stay deployed, unused, for one release, then are deleted with the next
  ordinary release. **BREAKING** for that later release only: a tab still running a client older
  than this change loses its write endpoints once they are deleted.
- Zero moves to 1.11 (client and every `rocicorp/zero` image), for mutator return values,
  `retryOn` and its error-leak fix.
- `ZERO_MUTATE_URL` and `ZERO_ENABLE_CRUD_MUTATIONS=false` are set in prod.
- AGENTS.md and `openspec/config.yaml` replace "Never Zero mutators" with the mutator rules, and
  add the deploy-skew rule for mutator arguments.

## Non-goals

- Offline writes. Queueing writes while disconnected, with an inbox for rejected ones, is the
  next change after this one, and it needs client-generated ids first.
- Client-generated ids. Primary keys stay serial; a later change can move them to time-ordered
  bigint ids generated on the client.
- Remote reads (`userContributionCount`, `regionTagUsage`, `listRegionInvitations`,
  `listMyInvitations`, `regionStats`, `listAllRegions`, `listFeedback`, `listErrorLogs`). They
  stay remote queries.
- Auth and account (`signIn`, `signUp`, `forgotPassword`, `resetPassword`, `signOut`,
  `updateEmail`, `updatePassword`) and the open `logClientError` endpoint.
- The upload pipeline (`finalizeImage`, `createBunnyVideo`, `finalizeVideo`), `sendTestPush` and
  `replyToFeedback`, which stay endpoints because their external I/O is the answer.
- The native app, `packages/shared`, and any SvelteKit 3 upgrade.

## Capabilities

### New Capabilities

- `sync/mutations`: how a write behaves for the person making it (instant or awaited, refusal,
  offline, undo) and what the server guarantees about it (permission, exactly-once side effects,
  no leaked internals).

### Modified Capabilities

None. `topo/route-editing` already states its save behaviour at a level this change keeps.

## Impact

- **Entity modules**: `area`, `ascent`, `block`, `favorite`, `feedback`, `file`, `notification`,
  `reaction`, `region`, `route`, `topo`, `user` (their `*.remote.ts`, new `*.server.ts` bodies,
  `dto.ts` argument schemas), plus `src/lib/zero/mutators.ts` and `mutators.server.ts`.
- **Shared code**: `src/lib/forms/` (`Form.svelte`, `FormGate`, `FormError`, `seed.svelte.ts`, the
  new form store), `src/lib/remote/` (`authed.server.ts`, `mutation.ts`, `gates.test.ts`),
  `src/lib/state/toast.ts` (`withUndo`), `src/lib/db/db.server.ts` (`applyRls`).
- **Routes**: every add and edit screen under `src/routes/(app)`, and the new
  `src/routes/api/zero/mutate/+server.ts`. No URL changes.
- **Tables**: every table those modules write. One schema change: `region_invitations` gains
  `last_delivered_at`, backfilled from `last_sent_at`. Idempotency needs no table: notifications
  already collapse on their natural key and email already takes an idempotency key. Zero's own
  mutation bookkeeping (last mutation ids, 1.11 return values) lives in its shard schema.
- **Client-breaking**: no remote function export is moved or renamed in this release, so
  already-loaded tabs keep working across the deploy and reload into the new client from the
  service worker. Zero 1.11 must reach zero-cache before the app: an upgraded client cannot connect
  to a 1.9 server.
- **Ops**: `deployment/docker-compose.zero.yml` (image, `ZERO_MUTATE_URL`,
  `ZERO_ENABLE_CRUD_MUTATIONS`), deploy order zero-cache, then app.
