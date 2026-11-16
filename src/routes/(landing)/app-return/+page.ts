import type { PageLoad } from './$types'

// Server-rendered only: no client script runs here, and nothing reads the query.
export const csr = false

export const load: PageLoad = ({ setHeaders }) => {
  setHeaders({ 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' })
}
