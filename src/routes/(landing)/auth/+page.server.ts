import { resolve } from '$app/paths'
import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = () => {
  redirect(302, resolve('/(landing)/auth/(tabs)/signin'))
}
