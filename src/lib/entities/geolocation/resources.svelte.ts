import { holdWhileDeleting } from '$lib/zero/deleting.svelte'
import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { toParkingDetail } from './mapper'

export function parkingDetail(id: () => number) {
  const parking = createResource(
    () => queries.parking({ id: id() }),
    (row) => (row == null ? undefined : toParkingDetail(row)),
  )
  return holdWhileDeleting(parking, 'parking', id)
}
