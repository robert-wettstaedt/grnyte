import { NEXTCLOUD_USER_NAME } from '$env/static/private'
import { getNextcloud } from '$lib/nextcloud/nextcloud.server'
import { convertPathToPoints, convertPointsToPath } from '$lib/topo'
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import sharp from 'sharp'
import type { ResponseDataDetailed } from 'webdav'
import * as schema from '../schema'

export const migrateTopoPercentages = async (db: PostgresJsDatabase<typeof schema>) => {
  const topo = await db.query.topos.findFirst({
    where: (table, { eq }) => eq(table.id, 215),
    with: {
      file: true,
      routes: true,
    },
  })

  if (topo?.file == null) {
    return
  }

  const result = await getNextcloud()?.getFileContents(`${NEXTCLOUD_USER_NAME}/${topo.file.path}`, {
    details: true,
  })
  const { data } = result as ResponseDataDetailed<ArrayBuffer>

  const image = sharp(data)
  const { width, height } = await image.metadata()
  console.log({ width, height })

  if (width == null || height == null) {
    throw new Error('width or height not found')
  }

  const topoRoutes = topo.routes
    .filter((i) => i.path != null)
    .map((topoRoute) => {
      const points = convertPathToPoints(topoRoute.path!)

      const newPoints = points.map((point) => {
        return {
          ...point,
          x: point.x >= 1 ? point.x / width : point.x,
          y: point.y >= 1 ? point.y / height : point.y,
        }
      })

      const newPath = convertPointsToPath(newPoints)
      return { ...topoRoute, path: newPath }
    })

  await Promise.all(
    topoRoutes.map((topoRoute) =>
      db.update(schema.topoRoutes).set({ path: topoRoute.path }).where(eq(schema.topoRoutes.id, topoRoute.id)),
    ),
  )
}
