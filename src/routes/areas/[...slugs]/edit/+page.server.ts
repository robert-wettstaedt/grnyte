import { convertException } from '$lib'
import { db } from '$lib/db/db.server.js'
import { areas } from '$lib/db/schema'
import { validateAreaForm, type AreaActionFailure, type AreaActionValues } from '$lib/forms.server'
import { convertAreaSlug } from '$lib/slugs.server'
import { error, fail, redirect } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals, parent }) => {
  // Retrieve the areaId from the parent function
  const { areaId } = await parent()

  // Authenticate the user session
  const session = await locals.auth()
  if (session?.user == null) {
    // If the user is not authenticated, throw a 401 error
    error(401)
  }

  // Query the database to find the area with the given areaId
  const areasResult = await db.query.areas.findMany({ where: eq(areas.id, areaId) })
  const area = areasResult.at(0)

  // If the area is not found, throw a 404 error
  if (area == null) {
    error(404)
  }

  // Return the found area
  return area
}) satisfies PageServerLoad

export const actions = {
  default: async ({ locals, params, request }) => {
    // Authenticate the user session
    const session = await locals.auth()
    if (session?.user == null) {
      // If the user is not authenticated, throw a 401 error
      error(401)
    }

    // Retrieve form data from the request
    const data = await request.formData()
    let values: AreaActionValues

    try {
      // Validate the form data
      values = await validateAreaForm(data)
    } catch (exception) {
      // If validation fails, return the exception as an AreaActionFailure
      return exception as AreaActionFailure
    }

    // Convert the area slug to get the areaId
    const { areaId } = convertAreaSlug(params)

    try {
      // Update the area in the database with the validated values
      await db.update(areas).set(values).where(eq(areas.id, areaId))
    } catch (exception) {
      // If the update fails, return a 404 error with the exception details
      return fail(404, { ...values, error: convertException(exception) })
    }

    // Redirect to the updated area page
    redirect(303, `/areas/${params.slugs}`)
  },
}
