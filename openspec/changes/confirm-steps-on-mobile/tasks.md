# Tasks

## 1. Component

- [ ] 1.1 Stack `Dialog.svelte`'s actions at full width below the desktop breakpoint (main, second, Cancel) and keep a right-aligned row above it; make the card `w-md` on desktop; verify with a component test that the buttons render in that order (seen red)
- [ ] 1.2 Add `destructive` (main action in the error preset) and the optional `secondary` action that runs its handler and closes; verify with a component test that `secondary` runs and the main action does not (seen red)
- [ ] 1.3 Add stories for a destructive confirm and a two-action confirm to `Dialog.stories.svelte`, and check the existing stories still render

## 2. Consumers

- [ ] 2.1 Pass `destructive` from `AscentRow`, `MediaViewer`, `routes/f/[id]`, `ProfileFavorites`, `MemberRow` and `TagRow`
- [ ] 2.2 Drive every consumer at 375x667 and 1280x800, en and de, light and dark: stacked full-width buttons on mobile, bottom-right row on desktop, red destructive action, outside tap and Escape cancel

## 3. Verification

- [ ] 3.1 Run the AGENTS.md sweep over the touched paths: prettier, eslint, `vitest --project browser`, svelte-check, `lint:duplication`, `lint:unused`
