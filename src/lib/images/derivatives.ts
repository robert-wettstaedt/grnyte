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
 * Every stored object an image `path` could have produced, for unwinding it from
 * storage on delete: the served original, each webp derivative sibling, and the
 * pristine `.orig.*` sibling a HEIC upload keeps. `path` is always the `.jpg` we
 * serve so the orig's real extension isn't recoverable from it, but the sibling
 * only exists for HEIC (see finalizeImage), so it's one of exactly two
 * extensions. Both candidates are listed; the non-existent one 404s on a
 * best-effort remove (cheaper than a full-directory PROPFIND to find the real one).
 */
export const imageStoragePaths = (path: string): string[] => {
  const base = path.replace(/\.[^./]+$/, '')
  return [path, ...DERIVATIVE_SIZES.map((size) => derivativePath(path, size)), `${base}.orig.heic`, `${base}.orig.heif`]
}

/**
 * The derivative to serve for a requested display width: the smallest size that
 * still downscales (≥ requested), falling back to the largest available.
 */
export const pickDerivativeSize = (requestedWidth: number): DerivativeSize =>
  DERIVATIVE_SIZES.find((size) => size >= requestedWidth) ?? DERIVATIVE_SIZES.at(-1)!

/** The route that serves stored images. Only {@link imageSrc} builds these URLs. Deliberately not
 *  typed as a `Pathname`: this module stays importable from the standalone migration scripts, which
 *  do not run through SvelteKit's generated types. */
const IMAGE_ROUTE = '/image/'

/**
 * The URL serving `path`: the `size` derivative, or the untouched original when `size` is
 * omitted (several MB, so ask for it only where the user zooms in).
 *
 * The single place a served image URL is built. `size` is a {@link DerivativeSize} rather than
 * a number on purpose: a width with no derivative behind it used to typecheck happily and then
 * get silently rounded UP by {@link pickDerivativeSize} at the server, so `?w=512` quietly
 * shipped the 1024 file. That cannot be written any more.
 */
export const imageSrc = (path: string, size?: DerivativeSize): string =>
  `${IMAGE_ROUTE}${path.replace(/^\/+/, '')}${size == null ? '' : `?w=${size}`}`

/**
 * Whether `url` is a request for a generated derivative, i.e. what {@link imageSrc} builds with
 * a `size`. Lives next to it so the service worker's cache matcher cannot drift from the route
 * that serves them - it silently pointed at a path nothing served for months, and a matcher that
 * never fires looks exactly like one that always misses.
 */
export const isDerivativeRequest = (url: URL): boolean =>
  url.pathname.startsWith(IMAGE_ROUTE) && url.searchParams.has('w')

/** Whether `path` is an image we generate derivatives for (also skips existing derivatives). */
export const isDerivableImage = (path: string): boolean =>
  /\.(jpe?g|png|webp|gif)$/i.test(path) && !/\.\d+\.webp$/i.test(path) && !/\.orig\.[^./]+$/i.test(path)

/**
 * EXIF-oriented pixel size — what browsers display, and the coordinate space
 * topo paths were drawn against. Orientations 5–8 rotate by 90°, so the stored
 * width/height come back swapped. `null` when sharp couldn't read a size.
 */
export const orientedDimensions = (meta: {
  height?: number
  orientation?: number
  width?: number
}): null | { height: number; width: number } => {
  if (meta.width == null || meta.height == null) {
    return null
  }
  const swapped = meta.orientation != null && meta.orientation >= 5
  return swapped ? { height: meta.width, width: meta.height } : { height: meta.height, width: meta.width }
}
