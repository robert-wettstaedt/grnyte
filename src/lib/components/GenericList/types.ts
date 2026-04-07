import type { Snippet } from 'svelte'

export interface BaseGenericListProps {
  class?: string
  empty?: string
  listClasses?: string
  wrap?: boolean
}

export interface GenericListProps<T> extends BaseGenericListProps {
  items: T[]

  left: Snippet<[T]>
  leftClasses?: string

  right?: Snippet<[T]>

  children?: Snippet<[T]>

  onConsiderSort?: (items: T[]) => void
  onFinishSort?: (items: T[]) => void
}
