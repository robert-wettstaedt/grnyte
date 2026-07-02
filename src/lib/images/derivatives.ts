/**
 * Pre-generated webp derivatives: `<base>.<size>.webp` siblings stored next to
 * each original image and served for `?w=` requests (chosen over Nextcloud's
 * jpeg previews for visibly better quality at the same bytes — see #472).
 *
 * Pure module — no `$env` — so both the server-side image provider and the
 * migration/upload pipelines share one source of truth for sizes and naming.
 */

/** Long-edge px of the generated derivatives: thumbnail tiles + the full-screen viewer. */
export const DERIVATIVE_SIZES = [256, 1024] as const

export const DERIVATIVE_QUALITY = 80

export type DerivativeSize = (typeof DERIVATIVE_SIZES)[number]

/** Storage path of the derivative for `path`, e.g. `/topos/138.jpg` → `/topos/138.1024.webp`. */
export const derivativePath = (path: string, size: DerivativeSize): string =>
  `${path.replace(/\.[^./]+$/, '')}.${size}.webp`

/**
 * The derivative to serve for a requested display width: the smallest size that
 * still downscales (≥ requested), falling back to the largest available.
 */
export const pickDerivativeSize = (requestedWidth: number): DerivativeSize =>
  DERIVATIVE_SIZES.find((size) => size >= requestedWidth) ?? DERIVATIVE_SIZES.at(-1)!

/** Whether `path` is an image we generate derivatives for (also skips existing derivatives). */
export const isDerivableImage = (path: string): boolean =>
  /\.(jpe?g|png|webp|gif)$/i.test(path) && !/\.\d+\.webp$/i.test(path) && !/\.orig\.[^./]+$/i.test(path)
