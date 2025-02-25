import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load = (({ params }) => {
  redirect(301, `/areas/${params.slugs}/_/blocks/${params.blockSlug}`)
}) satisfies PageServerLoad
