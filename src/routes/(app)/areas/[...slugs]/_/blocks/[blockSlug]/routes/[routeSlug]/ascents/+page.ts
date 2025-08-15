import { goto } from '$app/navigation'

export const load = ({ params }) => {
  const mergedPath = ['areas', params.slugs, '_', 'blocks', params.blockSlug, 'routes', params.routeSlug].join('/')
  goto('/' + mergedPath + '?tab=activity', { replaceState: true })
}
