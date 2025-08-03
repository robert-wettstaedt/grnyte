import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load = (({ params }) => {
  const mergedPath = ['areas', params.slugs, '_', 'blocks', params.blockSlug, 'routes', params.routeSlug].join('/')
  redirect(303, '/' + mergedPath + '#activity')
}) satisfies PageServerLoad
