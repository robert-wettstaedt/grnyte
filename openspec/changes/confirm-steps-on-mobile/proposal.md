# Proposal

## Why

The shared confirm dialog lays its buttons out desktop-style on a phone: two small buttons side by side at the bottom right of a wide card, hard to hit with a thumb and with no signal of which one is destructive. `notify-moderation-removals` also needs a confirm step that offers two actions (tidy up, or remove for breaking the rules), which the dialog cannot show.

## What Changes

- On mobile, a confirm step stacks its buttons at full width: the action on top, Cancel at the bottom. Its position, motion and title row stay as they are.
- On desktop, the card is 448 pixels wide with Cancel and the action at the bottom right.
- A destructive action renders red. Deleting an ascent, deleting media (viewer and file page), removing all favourites, leaving a region and removing a tag are destructive.
- A confirm step can offer a second action beside the main one, stacked under it on mobile.

## Non-goals

- Turning the confirm step into a bottom sheet. It stays a centred dialog on every size.
- Form fields inside a confirm step. Input belongs on a form page.
- Changing what any confirm step says, or adding confirm steps where there are none.

## Capabilities

### New Capabilities

- `interface/confirmations`: how a confirm step lays out its actions on mobile and desktop, and how a destructive action is marked.

### Modified Capabilities

None.

## Impact

- **Components**: `Dialog/Dialog.svelte` gains the stacked mobile layout, a `destructive` flag and an optional second action; `Dialog.stories.svelte` covers them.
- **Consumers**: `AscentRow.svelte`, `MediaViewer.svelte`, `routes/f/[id]/+page.svelte`, `ProfileFavorites.svelte`, `MemberRow.svelte` and `TagRow.svelte` each pass `destructive`; nothing else in them changes.
- **No** schema, mutator, route or copy change, so nothing for an already-loaded tab to break across a deploy.
- **Unblocks**: `notify-moderation-removals`, whose admin delete choice is this dialog with a second action.
