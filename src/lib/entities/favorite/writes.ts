import type * as z from '$lib/forms/zod'
import { mutators } from '$lib/zero/mutators'
import { write } from '$lib/zero/write'
import type { favoriteSetArgs } from './dto'

/** Saves or clears a favorite: `saved` is the state wanted, so a replay never flips it back. */
export const saveFavorite = (args: z.input<typeof favoriteSetArgs>) => write(mutators.favorites.set(args))
