import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from '../schema'
import type { InferResultType } from '../types'

export const migrate = async (db: PostgresJsDatabase<typeof schema>, areaId?: number) => {
  const buildNestedAreaQuery = (depth = 4) => {
    let nestedAreaQuery: Parameters<typeof db.query.areas.findMany>[0] = {
      with: {
        parent: true,
      },
    }

    for (let i = 0; i < depth; i++) {
      nestedAreaQuery = {
        with: {
          parent: nestedAreaQuery,
        },
      }
    }

    return nestedAreaQuery
  }

  const blocks = await db.query.blocks.findMany({
    where: areaId == null ? undefined : eq(schema.blocks.areaFk, areaId),
    with: {
      area: buildNestedAreaQuery(),
    },
  })

  await db.transaction(async (tx) => {
    await Promise.all(
      blocks.map(async (block) => {
        const areaFks: number[] = [block.areaFk]
        let current = block.area as InferResultType<'areas', { parent: true }> | null
        while (current?.parent != null) {
          areaFks.push(current.parent.id)
          current = current.parent as InferResultType<'areas', { parent: true }> | null
        }
        areaFks.reverse()

        const areaIds = areaFks.map((id) => `^${id}$`).join(',')

        await tx.update(schema.routes).set({ areaFks, areaIds }).where(eq(schema.routes.blockFk, block.id))
      }),
    )
  })
}
