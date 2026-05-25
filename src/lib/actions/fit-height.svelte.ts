import type { Action } from 'svelte/action'

interface Opts {
  heightSubtrahend?: number
  paddingBottom?: number
}

export const fitHeightAction: Action<HTMLElement, Opts | undefined> = (node, opts) => {
  let currentOpts = opts

  const calcHeight = () => {
    const { heightSubtrahend = 0, paddingBottom = 32 } = currentOpts ?? {}

    const appBarBcr = document.querySelector('[data-scope="app-bar"][data-part="root"]')?.getBoundingClientRect()
    if (appBarBcr) {
      node.style.marginTop = `${appBarBcr.height}px`
    }

    const bcr = node.getBoundingClientRect()
    const navBarBcr = document
      .querySelector('[data-scope="navigation"][data-part="root"][data-layout="bar"]')
      ?.getBoundingClientRect()

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
    update: (newOpts) => {
      currentOpts = newOpts
      calcHeight()
    },
    destroy: () => {
      cleanup()
    },
  }
}
