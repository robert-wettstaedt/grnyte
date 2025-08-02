import type { Action } from 'svelte/action'

export const focus: Action<HTMLElement> = (node) => {
  requestAnimationFrame(() => {
    node.focus()
  })
}
