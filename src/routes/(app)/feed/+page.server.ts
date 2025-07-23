import { loadFeed } from '$lib/components/ActivityFeedLegacy/load.server'

export const load = async (event) => {
  return { feed: await loadFeed(event) }
}
