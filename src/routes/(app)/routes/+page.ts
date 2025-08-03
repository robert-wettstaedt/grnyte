import { goto } from '$app/navigation'

export const load = () => {
  goto('/areas?tab=routes', { replaceState: true })
}
