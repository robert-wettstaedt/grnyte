/**
 * The deployment facts every email carries: logo origin, footer wordmark, contact address.
 *
 * No environment is read here. The app reads `.env` through `$env/static/public`, which does not
 * resolve under tsx; the scripts read `process.env`, which SvelteKit never fills for SSR. Each side
 * reads its own and calls `makeBrand`: `send.server.ts` and `brand.cli.ts`.
 */

export interface Brand {
  /** Rendered inside copy, so an address and never a URL. */
  contactEmail: string
  /** Host only, no scheme. */
  domain: string
  /** Logo origin, unless a mail overrides it. */
  origin: string
}

/** Throws rather than defaulting: a default is a wrong deployment in mail already delivered. */
export const makeBrand = (env: { contactEmail: string | undefined; origin: string | undefined }): Brand => {
  const { contactEmail, origin } = env

  if (origin == null || origin === '') {
    throw new Error('PUBLIC_ORIGIN is not set, and the email module has no default for it.')
  }
  if (contactEmail == null || contactEmail === '') {
    throw new Error('PUBLIC_TOPO_EMAIL is not set, and the email module has no default for it.')
  }

  return { contactEmail, domain: new URL(origin).host, origin }
}
