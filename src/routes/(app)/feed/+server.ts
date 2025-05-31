import { loadFeed } from '$lib/components/ActivityFeed/load.server'

export const POST = async (event) => {
  return new Response(JSON.stringify(await loadFeed(event)))
}
