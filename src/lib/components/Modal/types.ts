import type { PopoverRootProps } from '@skeletonlabs/skeleton-svelte'
import type { Snippet } from 'svelte'
import type { SvelteHTMLElements } from 'svelte/elements'

export interface Props {
  /** Render a blurred, tap-to-dismiss scrim behind the modal. On mobile it backs the
   *  sheet; on a desktop `panel` it also makes the dialog modal (focus trap + outside close). */
  backdrop?: boolean
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
  /** This sheet opens on top of another open sheet: raise its z-index so the one below is fully covered. Mobile only. */
  nested?: boolean
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
