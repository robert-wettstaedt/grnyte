# Proposal

## Why

A person cannot delete their own grnyte account today: the privacy policy says there is no self-serve button, and a deletion is a request carried out by hand. The App Store and Google Play both require account deletion inside the app before a native client can ship, and GDPR's right to erasure applies to the web app already. The decisions about what happens to shared guidebook data are easiest to settle now, before the native app adds a second client.

## What Changes

- A new full-screen route `/settings/account/delete`, linked from `/settings`, where a signed-in person deletes their account by re-entering their password. Deletion is immediate and final: no grace period, no undo.
- Deletion is refused while the person is the only active admin of a region that still has other active members. The screen names those regions, so they can hand admin to someone first.
- A region whose only active member is the person is deleted whole, with its areas, blocks, routes, topos, comments and files, including file storage.
- In every other region the person's guidebook contributions stay, with the author removed and shown as "Deleted user": areas, blocks, routes, topos, media on those, comments (threads stay intact), emoji reactions and the change history (`activities`). So do the feed events the person did (guidebook changes, and membership actions on other members such as role changes; the invite cards they sent go, like the invitations), with their comment threads and change history, and the notifications those caused in other members' inboxes. Feedback stays for the 12 months the privacy policy names, without its author.
- Deleted with the account: ascents and the media attached to them (route grade and rating averages recompute), feed events and notifications about the person (where they are the subject), notifications addressed to them, invitations they sent, favorites, settings, push subscriptions, app roles and region memberships, the `public.users` row, and finally the `auth.users` record through GoTrue's admin API.
- First ascensionist entries linked to the person lose the link and keep the name as plain text. Invitations they sent are deleted, and the inviter on memberships is cleared.
- **BREAKING (schema)**: the author columns (`created_by` on regions, areas, blocks, routes, files and feedback, plus `reactions.user_fk`, `reactions.auth_user_fk`, `activities.user_fk`, `events.actor_fk` and `notifications.actor_fk`) become nullable. Every mapper and permission check that reads an author handles `null`.
- A deleted author renders as a neutral person icon in a grey circle, never an initials avatar.
- Terms clause 19 and privacy policy section 7, in English and German, change to describe the button and the new retention (comments, guidebook media and feed activity stay anonymised; events about the person go). The sentence saying there is no self-serve button goes.

## Non-goals

- A data export ("download my data") before deletion. Data portability is its own change.
- A grace period or a "pending deletion" state.
- Deleting another person's account as an app admin.
- Content reporting and blocking for the app stores' user-generated-content rules. That is a separate change.
- An in-app notice to existing users about the policy edits.

## Capabilities

### New Capabilities

- `auth/account-deletion`: a person deleting their own account, the preconditions that refuse it, and what happens to each kind of data they leave behind.

### Modified Capabilities

None. `auth/sign-up-protection` deletes unconfirmed accounts, and its requirements do not change.

## Impact

- **Routes**: new `src/routes/(app)/settings/account/delete/+page.svelte`; a new row in `src/routes/(app)/settings/+page.svelte`. A new route only adds a URL, so already-loaded tabs are unaffected.
- **Remote functions**: a new `deleteAccount` command in `src/routes/(app)/settings/account.remote.ts`. It is account and auth work, which stays a remote function under AGENTS.md. Adding an export to an existing file does not move any endpoint id, so open tabs keep working.
- **Entity modules**: a new `src/lib/entities/user/delete.server.ts` holding the deletion. It reuses `file/cleanup.server.ts` (`deleteFileRows`, `removeFileStorage`), `region/guards.server.ts` (last-admin rule), `route/user-grade.server.ts` (`recalcUserGradeAndRating`) and the delete ordering already worked out in `db/testAccounts.ts` and `user/unconfirmed.server.ts`. The mappers and permissions of `area`, `block`, `route`, `file`, `region`, `ascent`, `feedback`, `reaction` and `event` take a nullable author.
- **Tables**: `users`, `user_settings`, `user_roles`, `region_members`, `region_invitations`, `regions`, `areas`, `blocks`, `routes`, `topos`, `files`, `bunny_streams`, `ascents`, `first_ascensionists`, `reactions`, `events`, `changes`, `notifications`, `activities`, `favorites`, `push_subscriptions`, `feedback`, `client_error_logs`, and `auth.users`.
- **Schema pipeline**: one migration making the author columns nullable, then `generate:zero`. No backfill: existing rows keep their authors.
- **Legal**: `src/routes/(landing)/legal/terms/terms.{en,de}.html` and `src/routes/(landing)/legal/privacy/privacy.{en,de}.html`. The user reviews these drafts before they ship.
- **i18n**: new keys in `messages/en.json` and `messages/de.json` for the screen, its refusals and "Deleted user".
- **Mobile**: the route gives the native app and the Google Play listing a stable deep link to deletion.
