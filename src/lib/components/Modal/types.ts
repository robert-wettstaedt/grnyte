import type { PopoverRootProps } from '@skeletonlabs/skeleton-svelte'
import type { Snippet } from 'svelte'
import type { SvelteHTMLElements } from 'svelte/elements'

type HTMLAttributes<T extends keyof SvelteHTMLElements, U extends keyof SvelteHTMLElements[T] = never> = Omit<
  SvelteHTMLElements[T],
  U
>

export interface Props {
  /** Render a tap-to-dismiss scrim behind the mobile sheet (no effect on desktop). */
  backdrop?: boolean
  children?: Snippet
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
  /** Desktop panel card classes (width/height), e.g. `w-sm max-h-[80dvh]`. */
  contentClass?: string
  popoverProps?: PopoverRootProps
  snapPoints?: number[]
  subtitle?: string
  title: string
  trigger: Snippet<[HTMLAttributes<'button'>]>
}
