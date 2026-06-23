import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { toParkingDetail } from './mapper'

export function parkingDetail(id: () => number) {
  return createResource(
    () => queries.parking({ id: id() }),
    (row) => (row == null ? undefined : toParkingDetail(row)),
  )
}
