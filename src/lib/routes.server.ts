import * as schema from '$lib/db/schema'
import { eq, isNotNull, or } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

export const updateRoutesUserData = async (routeFk: number, db: PostgresJsDatabase<typeof schema>) => {
  const route = await db.query.routes.findFirst({
    where: eq(schema.routes.id, routeFk),
    with: {
      ascents: {
        where: or(isNotNull(schema.ascents.gradeFk), isNotNull(schema.ascents.rating)),
      },
    },
  })

  if (route == null) {
    return null
  }

  const getMean = (key: 'gradeFk' | 'rating') => {
    const ascents = route.ascents.filter((ascent) => ascent[key] != null)

    let sum = ascents.reduce((sum, ascent) => sum + ascent[key]!, 0)
    let length = ascents.length

    if (route[key] != null) {
      sum += route[key]
      length += 1
    }

    if (length === 0) {
      return null
    }

    return Math.round(sum / length)
  }

  const userGradeFk = getMean('gradeFk')
  const userRating = getMean('rating')

  if (userGradeFk !== route.userGradeFk || userRating !== route.userRating) {
    await db.update(schema.routes).set({ userGradeFk, userRating }).where(eq(schema.routes.id, route.id))
  }
}
