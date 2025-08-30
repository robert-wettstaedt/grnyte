import { goto } from '$app/navigation'

export const load = ({ params }) => {
  const mergedPath = ['areas', params.slugs, '_', 'blocks', params.blockSlug].join('/')
  goto('/' + mergedPath + '?tab=topo', { replaceState: true })
}
