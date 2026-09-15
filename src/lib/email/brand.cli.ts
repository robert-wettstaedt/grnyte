import { makeBrand } from './brand'

/**
 * The brand for everything that renders mail outside the app: `generate.ts`, `test-send.ts`,
 * `announce.ts` and `templates.ts`, which only those import.
 *
 * Read at import, so each entry point's `import 'dotenv/config'` has to stay first.
 */
export const BRAND = makeBrand({
  contactEmail: process.env.PUBLIC_TOPO_EMAIL,
  origin: process.env.PUBLIC_ORIGIN,
})
