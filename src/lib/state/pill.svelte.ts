import type { IconName } from '$lib/components/Icon/icons'
import { getContext, setContext, untrack } from 'svelte'
import { SvelteSet } from 'svelte/reactivity'

/** What the pill shows: a screen's offer, or the generic syncing status. */
export type PillContent = PillOffer | { kind: 'syncing' }

/** What a screen hands its surface's pill: an action to take, or a status of its own. */
export type PillOffer =
  { icon: IconName; kind: 'action'; label: string; onclick: () => void } | { kind: 'status'; label: string }

/** The screen, or a sheet, panel or dialog over it: each draws its own pill. */
export class PillSurface {
  /** The bottom edge of the page header the pill hangs from, the latest mounted one; none without,
   *  or when that header is hidden (zero high). */
  get anchorBottom(): number | undefined {
    return this.#anchors[this.#anchors.length - 1]?.() || undefined
  }

  /** The pill's content right now, before its show delay and hide linger; an action wins. */
  get content(): PillContent | undefined {
    const offered = [...this.#offers].map((offer) => offer()).filter((offer) => offer != null)
    return (
      offered.find((offer) => offer.kind === 'action') ??
      offered[0] ??
      (this.#holders.size > 0 ? { kind: 'syncing' } : undefined)
    )
  }

  #anchors = $state<(() => number)[]>([])

  #holders = new SvelteSet<object>()

  #offers = new SvelteSet<() => PillOffer | undefined>()

  /** Hangs the pill below a page header's bottom edge until the returned release. */
  anchor(bottom: () => number): () => void {
    // Untracked, so an effect that anchors does not depend on the list it changes.
    untrack(() => this.#anchors.push(bottom))
    return () =>
      untrack(() => {
        const index = this.#anchors.indexOf(bottom)
        if (index !== -1) this.#anchors.splice(index, 1)
      })
  }

  /** Holds the syncing pill up until the returned release. */
  hold(holder: object): () => void {
    this.#holders.add(holder)
    return () => this.#holders.delete(holder)
  }

  /** Offers the pill a reactive action or status until the returned withdrawal. */
  offer(offer: () => PillOffer | undefined): () => void {
    this.#offers.add(offer)
    return () => this.#offers.delete(offer)
  }
}

const KEY = Symbol('pill-surface')

/** The surface for anything outside a screen or sheet that sets its own: the chromeless screens. */
export const rootPill = new PillSurface()

let quiet = 0

/** A new surface for everything this component renders. Call during component init. */
export function createPillSurface(): PillSurface {
  return setContext(KEY, new PillSurface())
}

/** Whether a resource built now holds its surface's pill while it arrives. */
export function holdsPill(): boolean {
  return quiet === 0
}

/** The nearest surface, or none outside component init, where nothing draws a pill to hold. */
export function pillSurface(): PillSurface | undefined {
  try {
    return getContext<PillSurface | undefined>(KEY) ?? rootPill
  } catch {
    return undefined
  }
}

/** Builds resources whose arrival says nothing about the screen (app-wide rows, search results). */
export function quietly<T>(build: () => T): T {
  quiet++
  try {
    return build()
  } finally {
    quiet--
  }
}
