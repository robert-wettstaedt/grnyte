import { convertException } from '$lib'
import { db } from '$lib/db/db.server'
import { areas, blocks } from '$lib/db/schema'
import { buildNestedAreaQuery, enrichBlock } from '$lib/db/utils'
import { searchNextcloudFile } from '$lib/nextcloud/nextcloud.server'
import { error } from '@sveltejs/kit'
import { and, eq, isNotNull } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals, parent }) => {
  // Retrieve the areaId from the parent context
  const { areaId } = await parent()
  // Get the current session from locals
  const session = await locals.auth()

  // Query the database for areas with the specified areaId
  const areasResult = await db.query.areas.findMany({
    where: eq(areas.id, areaId),
    with: {
      author: true, // Include author information
      blocks: {
        orderBy: blocks.name, // Order blocks by name
      },
      areas: {
        orderBy: areas.name, // Order nested areas by name
      },
      files: true, // Include files associated with the area
    },
  })

  // Get the last area from the result
  const area = areasResult.at(-1)

  // If no area is found, throw a 404 error
  if (area == null) {
    error(404)
  }

  // Query the database for blocks with geolocation data
  const geolocationBlocksResults = await db.query.blocks.findMany({
    where: and(isNotNull(blocks.lat), isNotNull(blocks.long)),
    with: {
      area: buildNestedAreaQuery(), // Include nested area information
    },
  })

  // Process each file associated with the area
  const files = await Promise.all(
    area.files.map(async (file) => {
      try {
        // Search for the file in Nextcloud
        const stat = await searchNextcloudFile(session, file)

        // Return the file with its stat information
        return { ...file, error: undefined, stat }
      } catch (exception) {
        // If an error occurs, convert the exception and return it with the file
        return { ...file, error: convertException(exception), stat: undefined }
      }
    }),
  )

  // Return the area, enriched blocks, and processed files
  return {
    area,
    blocks: geolocationBlocksResults.map(enrichBlock),
    files,
  }
}) satisfies PageServerLoad
