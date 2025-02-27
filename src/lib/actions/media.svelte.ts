import type { Action } from 'svelte/action'

export const media: Action<
  HTMLElement,
  undefined,
  {
    onLoadStart: (e: CustomEvent) => void
    onLoadEnd: (e: CustomEvent) => void
    onError: (e: CustomEvent) => void
  }
> = (el: HTMLElement) => {
  const onError = () => (mediaHasError = true)
  const onLoad = () => (mediaIsLoading = false)
  const onLoadStart = () => (mediaIsLoading = true)

  const errorEl = el.tagName === 'VIDEO' ? el.querySelector('source') : el

  errorEl?.addEventListener('error', onError)
  el.addEventListener('load', onLoad)
  el.addEventListener('loadeddata', onLoad)
  el.addEventListener('loadstart', onLoadStart)

  return {
    destroy: () => {
      errorEl?.removeEventListener('error', onError)
      el.removeEventListener('load', onLoad)
      el.removeEventListener('loadeddata', onLoad)
      el.removeEventListener('loadstart', onLoadStart)
    },
  }
}
