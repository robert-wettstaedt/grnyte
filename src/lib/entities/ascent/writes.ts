import { mutators } from '$lib/zero/mutators'
import { write } from '$lib/zero/write'
import { entityHref } from '../href'
import type { AscentFormInput } from './dto'

export const createAscent = (values: AscentFormInput) =>
  write<{ id: number }>(mutators.ascents.create(values), { redirectTo: entityHref('routes', Number(values.routeId)) })

export const updateAscent = (values: AscentFormInput) =>
  write<{ id: number; routeFk: number }>(mutators.ascents.update(values), {
    redirectTo: ({ routeFk }) => entityHref('routes', routeFk),
  })

export const deleteAscent = (id: number) => write(mutators.ascents.delete({ id }))
