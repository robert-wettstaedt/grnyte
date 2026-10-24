import { getGlobalState } from '$lib/state/global.svelte'
import { tick } from 'svelte'
import { offersRemovalChoice } from './permissions'

export function createRemovalChoice(regionFk: () => number, onDelete: () => Promise<unknown>) {
  const global = getGlobalState()
  let open = $state(false)

  return {
    get open() {
      return open
    },
    set open(value: boolean) {
      open = value
    },
    /** Runs after the menu closed: a dialog opening in the same flush loses its focus trap. */
    async start() {
      if (!offersRemovalChoice(global.userRegions, regionFk())) return onDelete()
      await tick()
      open = true
    },
  }
}
