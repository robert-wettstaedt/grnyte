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
  headerLeft?: Snippet
  headerRight?: Snippet
  open?: boolean
  popoverProps?: PopoverRootProps
  snapPoints?: number[]
  subtitle?: string
  title: string
  trigger: Snippet<[HTMLAttributes<'button'>]>
}
