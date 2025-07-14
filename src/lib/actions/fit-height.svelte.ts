import type { Action } from 'svelte/action'

interface Opts {
  heightSubtrahend?: number
  paddingBottom?: number
}

export const fitHeightAction: Action<HTMLElement, Opts | undefined> = (node, opts) => {
  const { heightSubtrahend = 0, paddingBottom = 32 } = opts ?? {}

  const calcHeight = () => {
    const bcr = node.getBoundingClientRect()
    const navBarBcr = document.querySelector('[data-testid="nav-bar"]')?.getBoundingClientRect()
    const h = heightSubtrahend > 0 ? heightSubtrahend : (navBarBcr?.height ?? 0)

    node.style.height = `${window.innerHeight - bcr.top - paddingBottom - h}px`
  }

  const cleanup = $effect.root(() => {
    const observer = new ResizeObserver(calcHeight)
    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  })

  return {
    destroy: () => {
      cleanup()
    },
  }
}
