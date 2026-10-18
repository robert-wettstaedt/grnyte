import { mutators } from '$lib/zero/mutators'
import { write } from '$lib/zero/write'
import { entityHref } from '../href'
import type { RouteFormInput } from './dto'

export const updateRoute = (values: RouteFormInput) =>
  write(mutators.routes.update(values), { redirectTo: entityHref('routes', Number(values.id)) })
