import { command, getRequestEvent } from '$app/server'
import { db } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import z from 'zod'

const errorLogSchema = z.object({
  error: z.string(),
  navigator: z.json(),
  pathname: z.string(),
})

export const saveErrorLog = command(errorLogSchema, async (values) => {
  const { locals } = getRequestEvent()

  await db.insert(schema.clientErrorLogs).values({
    createdBy: locals.user?.id,
    ...values,
  })
})
