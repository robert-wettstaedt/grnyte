import type { PopoverRootProps } from '@skeletonlabs/skeleton-svelte'
import type { Snippet } from 'svelte'
import type { SvelteHTMLElements } from 'svelte/elements'

export interface MobileProps extends Props {
  /** Stack level, resolved by `Modal.svelte` from the sheets around it. Never a caller's to pass. */
  depth?: number
}

export interface Props {
  /**
   * Render a blurred, tap-to-dismiss scrim behind the modal.
   *
   * `true` backs the mobile sheet and also makes a desktop `panel` modal: focus trap and
   * close-on-outside. `'mobile'` is the scrim without that half, for a panel whose page has
   * to stay interactive while it is open (the map filter, where you pan and filter at once).
   * The sheet cannot make that distinction, so it treats both the same.
   */
  backdrop?: 'mobile' | boolean
  children?: Snippet
  /** Desktop panel card classes (width/height), e.g. `w-sm max-h-[80dvh]`. */
  contentClass?: string
  /**
   * Mobile only: the body fills the sheet instead of being sized by its content, so a child that
   * scrolls itself (the emoji picker) is not also wrapped in the sheet's own scrollbar. Opt-in,
   * because a body shorter than the sheet gains nothing from it. On desktop, give `contentClass`
   * a height for the same effect.
   */
  fill?: boolean
  /** Pinned footer (e.g. action buttons). Fixed to the sheet bottom on mobile, to the panel bottom on desktop. */
  footer?: Snippet
  headerLeft?: Snippet
  headerRight?: Snippet
  open?: boolean
  /**
   * Desktop only: render as a fixed positioned panel (a non-modal Dialog) instead
   * of the default trigger-anchored popover. Position/size come from `panelClass`
   * (the positioner) and `contentClass` (the card). No effect on mobile.
   */
  panel?: boolean
  /** Desktop panel positioner classes (placement), e.g. `fixed top-16 left-27 z-60`. */
  panelClass?: string
  popoverProps?: PopoverRootProps
  snapPoints?: number[]
  subtitle?: string
  title: string
  /**
   * The control that opens this, rendered in place.
   *
   * Optional, and only optional in `panel` mode: a popover anchors itself to whatever this
   * renders, while a panel is positioned by `panelClass` and never touches it. A caller that owns
   * its own button (one that has to exist whether or not the dialog has been built yet) binds
   * `open` and leaves this out.
   */
  trigger?: Snippet<[HTMLAttributes<'button'>]>
}

type HTMLAttributes<T extends keyof SvelteHTMLElements, U extends keyof SvelteHTMLElements[T] = never> = Omit<
  SvelteHTMLElements[T],
  U
>
