import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
import type { PageLoad } from './$types'

const KEY = `[${PUBLIC_APPLICATION_NAME}] recent-search`
const MAX_RECENT_SEARCH = 7

export const load = (async ({ data, url }) => {
  if (globalThis.localStorage != null) {
    const query = url.searchParams.get('q')
    let recentSearch = globalThis.localStorage.getItem(KEY)?.split(',') ?? []

    const length =
      (data?.searchResults?.areas?.length ?? 0) +
      (data?.searchResults?.blocks?.length ?? 0) +
      (data?.searchResults?.routes?.length ?? 0) +
      (data?.searchResults?.users?.length ?? 0)

    if (query != null && length > 0) {
      recentSearch = recentSearch.filter((item) => item !== query)
      recentSearch.unshift(query)
      recentSearch = recentSearch.slice(0, MAX_RECENT_SEARCH)
      globalThis.localStorage.setItem(KEY, recentSearch.join(','))
    }

    return { ...data, recentSearch }
  }

  return data
}) satisfies PageLoad
