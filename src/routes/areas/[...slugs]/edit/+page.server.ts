import { convertException } from '$lib'
import { db } from '$lib/db/db.server.js'
import { areas } from '$lib/db/schema'
import { validateAreaForm, type AreaActionFailure, type AreaActionValues } from '$lib/forms.server'
import { convertAreaSlug } from '$lib/slugs.server'
import { error, fail, redirect } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals, parent }) => {
  const { areaId } = await parent()

  const session = await locals.auth()
  if (session?.user == null) {
    error(401)
  }

  const areasResult = await db.query.areas.findMany({ where: eq(areas.id, areaId) })
  const area = areasResult.at(0)

  if (area == null) {
    error(404)
  }

  return area
}) satisfies PageServerLoad

export const actions = {
  default: async ({ locals, params, request }) => {
    const session = await locals.auth()
    if (session?.user == null) {
      error(401)
    }

    const data = await request.formData()
    let values: AreaActionValues

    try {
      values = await validateAreaForm(data)
    } catch (exception) {
      return exception as AreaActionFailure
    }

    const { areaId } = convertAreaSlug(params)

    try {
      await db.update(areas).set(values).where(eq(areas.id, areaId))
    } catch (exception) {
      return fail(404, { ...values, error: convertException(exception) })
    }

    redirect(303, `/areas/${params.slugs}`)
  },
}
