import type { RemovalInput } from '$lib/entities/moderation/dto'
import { mutators } from '$lib/zero/mutators'
import { write } from '$lib/zero/write'
import { entityHref } from '../href'
import type { AscentFormInput } from './dto'

/** `direct` when the answer is needed at once (photos to attach): never queued, refused offline. */
export const createAscent = (values: AscentFormInput, { direct = false } = {}) =>
  write<{ id: number }>(mutators.ascents.create(values), {
    direct,
    redirectTo: entityHref('routes', Number(values.routeId)),
  })

export const updateAscent = (values: AscentFormInput) =>
  write<{ id: number; routeFk: number }>(mutators.ascents.update(values), {
    redirectTo: ({ routeFk }) => entityHref('routes', routeFk),
  })

export const deleteAscent = (id: number, removal?: RemovalInput) => write(mutators.ascents.delete({ id, removal }))
