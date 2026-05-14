import type { Component, ComponentProps } from 'svelte'

export type Part<C extends Component<any>> = readonly [component: C, props: ComponentProps<C>, fallback: string]

export function part<C extends Component<any>>(component: C, props: ComponentProps<C>, fallback: string): Part<C> {
  return [component, props, fallback] as const
}
