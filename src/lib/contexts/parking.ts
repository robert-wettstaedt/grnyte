import type { ZeroQueryResult } from '$lib/components/ZeroQueryWrapper'
import type { queries } from '$lib/db/zero'
import { createContext } from 'svelte'

export interface ParkingContext {
  geolocation: ZeroQueryResult<ReturnType<(typeof queries)['geolocation']>>
}

export const [getParkingContext, setParkingContext] = createContext<ParkingContext>()
