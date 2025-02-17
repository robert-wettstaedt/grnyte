import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from '../schema'
import { eq } from 'drizzle-orm'

export const migrate = async (db: PostgresJsDatabase<typeof schema>) => {
  const routes = await db.query.routes.findMany({ with: { ascents: true } })

  await Promise.all(
    routes
      .filter((route) => route.ascents.some((ascent) => ascent.gradeFk != null))
      .map(async (route) => {
        const ascents = route.ascents.filter((ascent) => ascent.gradeFk != null)
        let gradeFkSum = ascents.reduce((sum, ascent) => sum + ascent.gradeFk!, 0)
        let length = ascents.length

        if (route.gradeFk != null) {
          gradeFkSum += route.gradeFk
          length += 1
        }

        const userGradeFk = Math.round(gradeFkSum / length)

        await db.update(schema.routes).set({ userGradeFk }).where(eq(schema.routes.id, route.id))
      }),
  )
}
