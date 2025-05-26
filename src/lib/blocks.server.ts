import { caches, getFromCacheWithDefault } from '$lib/cache/cache.server'
import type { NestedBlock } from '$lib/components/BlocksMap'
import type { db } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { areas, blocks } from '$lib/db/schema'
import type { InferResultType } from '$lib/db/types'
import { buildNestedAreaQuery, enrichBlock, enrichTopo } from '$lib/db/utils'
import { error } from '@sveltejs/kit'
import { arrayOverlaps, eq, isNotNull } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

export const getBlocksOfArea = async (areaId: number, db: PostgresJsDatabase<typeof schema>) => {
  const blocksQuery: {
    area: Parameters<typeof db.query.areas.findMany>[0]
    geolocation: true
    routes: true
  } = {
    area: buildNestedAreaQuery(2),
    geolocation: true,
    routes: true,
  }

  const area = await db.query.areas.findFirst({
    where: eq(areas.id, areaId),
    with: {
      author: true,
      blocks: {
        orderBy: [blocks.order, blocks.name],
        with: blocksQuery,
      },
      areas: {
        orderBy: areas.name,
        with: {
          author: true,
          blocks: {
            orderBy: [blocks.order, blocks.name],
            with: blocksQuery,
          },
          areas: {
            orderBy: areas.name,
            with: {
              blocks: {
                orderBy: [blocks.order, blocks.name],
                with: blocksQuery,
              },
            },
          },
          parkingLocations: true,
        },
      },
      parkingLocations: true,
    },
  })

  // If no area is found, throw a 404 error
  if (area == null) {
    error(404)
  }

  const allBlocks = [
    ...area.blocks,
    ...area.areas.flatMap((area) => area.blocks),
    ...area.areas.flatMap((area) => area.areas).flatMap((area) => area.blocks),
  ]

  const enrichedBlocks = allBlocks.map((block) => {
    const enrichedBlock = enrichBlock(block)

    return {
      ...block,
      ...enrichedBlock,
    }
  })

  const result = { area, blocks: enrichedBlocks }

  return result
}

export const getToposOfArea = async (areaId: number, db: PostgresJsDatabase<typeof schema>) => {
  const blocksQuery: {
    area: Parameters<typeof db.query.areas.findMany>[0]
    geolocation: true
    routes: {
      with: {
        firstAscents: {
          with: {
            firstAscensionist: true
          }
        }
        tags: true
      }
    }
    topos: {
      with: {
        file: true
        routes: true
      }
    }
  } = {
    area: buildNestedAreaQuery(2),
    geolocation: true,
    routes: {
      with: {
        firstAscents: {
          with: {
            firstAscensionist: true,
          },
        },
        tags: true,
      },
    },
    topos: {
      with: {
        file: true,
        routes: true,
      },
    },
  }

  const areasResult = await db.query.areas.findMany({
    where: eq(areas.id, areaId),
    with: {
      author: true,
      blocks: {
        orderBy: [blocks.order, blocks.name],
        where: isNotNull(blocks.geolocationFk),
        with: blocksQuery,
      },
      areas: {
        orderBy: areas.name,
        with: {
          blocks: {
            orderBy: [blocks.order, blocks.name],
            where: isNotNull(blocks.geolocationFk),
            with: blocksQuery,
          },
          areas: {
            orderBy: areas.name,
            with: {
              blocks: {
                orderBy: [blocks.order, blocks.name],
                where: isNotNull(blocks.geolocationFk),
                with: blocksQuery,
              },
              parkingLocations: true,
            },
          },
          parkingLocations: true,
        },
      },
      parkingLocations: true,
    },
  })

  // Get the last area from the result
  const area = areasResult.at(-1)

  // If no area is found, throw a 404 error
  if (area == null) {
    error(404)
  }

  const allBlocks = [
    ...area.blocks,
    ...area.areas.flatMap((area) => area.blocks),
    ...area.areas.flatMap((area) => area.areas).flatMap((area) => area.blocks),
  ]

  const enrichedBlocks = await Promise.all(
    allBlocks.map(async (block) => {
      const toposResult = await Promise.all(block.topos.map((topo) => enrichTopo(topo)))
      const enrichedBlock = enrichBlock(block)

      return {
        ...block,
        ...enrichedBlock,
        topos: toposResult,
      }
    }),
  )

  return {
    area,
    blocks: enrichedBlocks,
    areas: area.areas.map((area) => {
      return {
        ...area,
        blocks: enrichedBlocks.filter((block) => block.areaFk === area.id),
      }
    }),
  }
}

export const nestedAreaQuery: Parameters<typeof db.query.areas.findMany>[0] = {
  with: {
    areas: {
      with: {
        areas: {
          with: {
            areas: {
              with: {
                blocks: {
                  with: {
                    routes: true,
                  },
                },
              },
            },
            blocks: {
              with: {
                routes: true,
              },
            },
          },
        },
        blocks: {
          with: {
            routes: true,
          },
        },
      },
    },
    blocks: {
      with: {
        routes: true,
      },
    },
  },
}

interface AreaStats {
  numOfRoutes: number
  grades: { grade: string | undefined }[]
}

export const getStatsOfAreas = async (
  db: PostgresJsDatabase<typeof schema>,
  areaIds: number[],
  grades: schema.Grade[],
  user: InferResultType<'users', { userSettings: { columns: { gradingScale: true } } }> | undefined,
) => {
  const routes =
    areaIds.length === 0
      ? []
      : await db.query.routes.findMany({
          where: arrayOverlaps(schema.routes.areaFks, areaIds),
          columns: {
            areaFks: true,
            userGradeFk: true,
            gradeFk: true,
          },
        })

  const allAreaIds = routes.flatMap((route) => route.areaFks ?? [])
  const distinctAreaIds = [...new Set(allAreaIds)]

  const areaStats = distinctAreaIds.reduce(
    (obj, areaId) => {
      const areaRoutes = routes.filter((route) => route.areaFks?.includes(areaId))

      const gradesObj = areaRoutes.map((route): AreaStats['grades'][0] => {
        const grade = grades.find((grade) => grade.id === (route.userGradeFk ?? route.gradeFk))
        const gradeValue = grade?.[user?.userSettings?.gradingScale ?? 'FB'] ?? undefined

        return { grade: gradeValue }
      })

      return {
        ...obj,
        [areaId]: {
          numOfRoutes: areaRoutes.length,
          grades: gradesObj,
        },
      }
    },
    {} as Record<number, AreaStats | undefined>,
  )

  return areaStats
}

export const getLayoutBlocks = async <T extends NestedBlock>(
  db: PostgresJsDatabase<typeof schema>,
  regions: App.Locals['userRegions'],
): Promise<T[]> => {
  return getFromCacheWithDefault(
    caches.layoutBlocks,
    regions,
    async () => {
      const blocks = await db.query.blocks.findMany({
        where: (table, { isNotNull }) => isNotNull(table.geolocationFk),
        with: {
          area: buildNestedAreaQuery(),
          geolocation: true,
        },
      })

      return blocks as T[]
    },
    undefined,
    null,
  )
}
