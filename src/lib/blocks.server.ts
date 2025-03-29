import { getFromCacheWithDefault } from '$lib/cache/cache.server'
import type { NestedBlock } from '$lib/components/BlocksMap'
import { config } from '$lib/config'
import type { db } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { areas, blocks } from '$lib/db/schema'
import type { InferResultType } from '$lib/db/types'
import { buildNestedAreaQuery, enrichBlock, enrichTopo } from '$lib/db/utils'
import { error } from '@sveltejs/kit'
import { eq, isNotNull } from 'drizzle-orm'
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

  const enrichedBlocks = allBlocks
    .filter((block) => block.geolocation != null)
    .map((block) => {
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

type NestedArea = InferResultType<
  'areas',
  { areas: { with: { areas: true; blocks: { with: { routes: true } } } }; blocks: { with: { routes: true } } }
>
const recursive = (area: NestedArea): schema.Route[] => {
  const routes = area.blocks?.flatMap((block) => block.routes ?? []) ?? []
  routes.push(...(area.areas?.flatMap((area) => recursive(area as NestedArea)) ?? []))

  return routes
}

export const getStatsOfArea = <T extends InferResultType<'areas'>>(
  area: T,
  grades: schema.Grade[],
  user: InferResultType<'users', { userSettings: { columns: { gradingScale: true } } }> | undefined,
) => {
  const routes = recursive(area as unknown as NestedArea)

  const gradesObj = routes.map((route) => ({
    grade: grades.find((grade) => grade.id === route.gradeFk)?.[user?.userSettings?.gradingScale ?? 'FB'],
  }))

  return {
    ...area,
    numOfRoutes: routes.length,
    grades: gradesObj,
  }
}

export const getStatsOfBlocks = <
  T extends InferResultType<'blocks', { routes: true; topos: { with: { routes: true; file: true } } }>,
>(
  blocks: T[],
  grades: schema.Grade[],
  user: InferResultType<'users', { userSettings: { columns: { gradingScale: true } } }> | undefined,
) => {
  return blocks.map((block) => {
    const { routes } = block

    const routesWithTopo = routes.map((route) => {
      const topo = block.topos.find((topo) => topo.routes.some((topoRoute) => topoRoute.routeFk === route.id))
      return { ...route, topo }
    })

    const gradesObj = routes
      .filter((route) => route.gradeFk != null)
      .map((route) => ({
        grade: grades.find((grade) => grade.id === route.gradeFk)?.[user?.userSettings?.gradingScale ?? 'FB'],
      }))

    return {
      ...block,
      numOfRoutes: routes.length,
      grades: gradesObj,
      routes: routesWithTopo,
    }
  })
}

export const getLayoutBlocks = async <T extends NestedBlock>(db: PostgresJsDatabase<typeof schema>): Promise<T[]> => {
  return getFromCacheWithDefault(config.cache.keys.layoutBlocks, async () => {
    const blocks = await db.query.blocks.findMany({
      where: (table, { isNotNull }) => isNotNull(table.geolocationFk),
      with: {
        area: buildNestedAreaQuery(),
        geolocation: true,
      },
    })

    const filteredBlocks = blocks.filter((block) => {
      let current = block.area as InferResultType<'areas', { parent: true }> | null

      while (current?.parent != null) {
        current = current.parent as InferResultType<'areas', { parent: true }> | null
      }

      return current?.visibility !== 'private'
    })

    return filteredBlocks as T[]
  })
}
