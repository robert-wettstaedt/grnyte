import { authedCommand } from '$lib/remote/authed.server'
import { favoriteEntityArgs } from './dto'
import { setFavorite } from './favorite.server'

/**
 * Add or remove the current user's favorite for an entity. Returns the new saved
 * state as the envelope's `data` so the caller can confirm (or revert) an optimistic toggle.
 */
export const toggleFavorite = authedCommand(favoriteEntityArgs, async (args, ctx) => ({
  data: await setFavorite(args, ctx),
}))
