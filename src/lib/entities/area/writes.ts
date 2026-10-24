import { resolve } from '$app/paths'
import type { RemovalInput } from '$lib/entities/moderation/dto'
import type * as z from '$lib/forms/zod'
import { whileDeleting } from '$lib/zero/deleting.svelte'
import { mutators } from '$lib/zero/mutators'
import { write } from '$lib/zero/write'
import { entityHref } from '../href'
import type {
  addParkingSchema,
  AreaFormInput,
  DeleteAreaSnapshot,
  restoreAreaSchema,
  restoreParkingSchema,
} from './dto'

export const createArea = (values: AreaFormInput) =>
  write<{ id: number }>(mutators.areas.create(values), { redirectTo: ({ id }) => entityHref('areas', id) })

export const updateArea = (values: AreaFormInput) =>
  write(mutators.areas.update(values), { redirectTo: entityHref('areas', Number(values.id)) })

/** Leaves for the parent, or the map for a top-level area. */
export const deleteArea = (area: { id: number; parentFk: null | number | undefined }, removal?: RemovalInput) =>
  whileDeleting('areas', area.id, () =>
    write<DeleteAreaSnapshot>(mutators.areas.delete({ id: area.id, removal }), {
      redirectTo: area.parentFk == null ? resolve('/explore') : entityHref('areas', area.parentFk),
    }),
  )

export const restoreArea = (snapshot: z.input<typeof restoreAreaSchema>) =>
  write<{ areaId: number }>(mutators.areas.restore(snapshot), {
    redirectTo: ({ areaId }) => entityHref('areas', areaId),
  })

export const addParking = (values: z.input<typeof addParkingSchema>) =>
  write(mutators.areas.addParking(values), { redirectTo: entityHref('areas', Number(values.areaId)) })

export const deleteParking = (parking: { areaFk: number | undefined; id: number }) =>
  whileDeleting('parking', parking.id, () =>
    write<z.output<typeof restoreParkingSchema>>(mutators.areas.deleteParking({ id: parking.id }), {
      redirectTo: parking.areaFk == null ? undefined : entityHref('areas', parking.areaFk),
    }),
  )

export const restoreParking = (snapshot: z.input<typeof restoreParkingSchema>) =>
  write(mutators.areas.restoreParking(snapshot))
