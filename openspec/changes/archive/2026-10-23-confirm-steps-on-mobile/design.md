# Design

## Context

See proposal.md for why. `Dialog.svelte` wraps Skeleton's Dialog: a centred card (`max-w-screen-sm`) on every size, a header with the title and a close button, content inside `Dialog.Description`, and a footer of Cancel plus one save button (`preset-filled`) that awaits `onsave` and then closes. Six consumers use it, all for one-sentence confirmations.

The look follows the principle of an iOS action sheet rather than its pixels: the action is the most prominent element, a destructive one is red, Cancel is set apart at the bottom of the stack, and nothing scrolls. Colours, radius and type come from the Skeleton theme.

## Goals / Non-Goals

**Goals:**

- Thumb-sized, clearly ranked actions on mobile without changing how consumers call the dialog.
- A second action for the moderation choice step.

**Non-Goals:**

- A sheet, form fields or a change to `Modal`.

## Decisions

### Layout by breakpoint, not a second component

The footer switches at `DESKTOP_QUERY`'s breakpoint with Tailwind classes: below it, a column of full-width buttons in the order main, second, Cancel; at and above it, a right-aligned row in the order Cancel, second, main. The card is `w-md` on desktop and keeps its 16 pixel margin on mobile. A CSS switch keeps one DOM, so focus order and tests do not branch.

### `destructive` and `secondary`

`destructive` swaps the main button to `preset-filled-error`, matching `MenuRow`'s destructive flag. `secondary` is an optional `{ text, onclick }` rendered as a tonal button; it closes the dialog like the main action. Alternative rejected: a list of actions, which no caller needs beyond two.

## Risks / Trade-offs

- [Six callers change visually at once] → drive each at 375 and 1280, en and de, light and dark; long German labels must fit on one line at full width.
- [Focus order differs from visual order on desktop when the row is reversed] → keep DOM order Cancel, second, main and stack it reversed on mobile with `flex-col-reverse`, so Tab follows what is seen on desktop and the main action is first on mobile.
