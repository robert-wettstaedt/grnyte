import type { ImageFailure } from '$lib/components/Image/failure'

/**
 * The coordinate space a topo overlay is drawn in, shared by the viewer and the editor.
 * Stored dims win: that is the original's pixel space, which legacy pixel paths were drawn against.
 */
export class TopoImageBox {
  /** Bound from the rendered `<Image>`: why the photo is a placeholder, or undefined while it
   *  is fine. The cause reaches the reader, since an offline photo comes back and a gone one does not. */
  failure = $state<ImageFailure | undefined>()

  /** Bound from the rendered `<Image>` (0 until it loads); see `TopoImage.svelte`. */
  naturalHeight = $state(0)
  naturalWidth = $state(0)

  /** `panzoom`'s aspect ratio as a number. */
  get aspect(): number | undefined {
    return this.ready ? this.width / this.height : undefined
  }

  /** CSS `aspect-ratio` for the container element. */
  get aspectRatio(): string | undefined {
    return this.ready ? `${this.width} / ${this.height}` : undefined
  }

  /** No photo behind the overlay. */
  get failed(): boolean {
    return this.failure != null
  }

  get height(): number {
    return this.#stored().height || this.naturalHeight || 0
  }

  /** Lines may be drawn: there is a coordinate space AND a photo to draw them on. Stored dims
   *  survive an offline placeholder, so `ready` alone would draw the topo over the fallback icon. */
  get overlayReady(): boolean {
    return this.ready && !this.failed
  }

  /** No coordinate space yet: the box has no ratio and the overlay nothing to render against. */
  get ready(): boolean {
    return this.width > 0 && this.height > 0
  }

  /** Marker size as a fraction of the image, so markers stay sized to the rock at any zoom. */
  get unit(): number {
    return Math.min(this.width, this.height) * 0.016
  }

  /** `viewBox` for the overlay svg. */
  get viewBox(): string {
    return `0 0 ${this.width} ${this.height}`
  }

  get width(): number {
    return this.#stored().width || this.naturalWidth || 0
  }

  #stored: () => { height?: number; width?: number }

  constructor(stored: () => { height?: number; width?: number }) {
    this.#stored = stored
  }
}
