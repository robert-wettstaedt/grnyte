import { db } from '$lib/db/db.server.js'
import { getAreaGPX } from '$lib/gpx.server.js'
import { convertAreaSlug } from '$lib/helper.server'

export async function GET({ params }) {
  const { areaId } = convertAreaSlug(params)

  const xml = await getAreaGPX(areaId, db)

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
    },
  })
}
