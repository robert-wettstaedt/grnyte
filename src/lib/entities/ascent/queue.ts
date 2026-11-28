import * as z from '$lib/forms/zod'
import type { QueueEntry } from '$lib/powersync/queue'
import { ascentActionSchema, type AscentFormInput } from './dto'

/** Logging an ascent joins the device queue: the row shows at once, marked, until the server's copy replaces it. */
export const ascentQueue: QueueEntry<AscentFormInput> = {
  apply: async (tx, args, account) => {
    const value = z.parse(ascentActionSchema, args)
    const user = await tx.get<{ nid: number }>('select nid from users where auth_user_fk = ?', [account])
    const route = await tx.get<{ region_fk: number }>('select region_fk from routes where nid = ?', [value.routeId])
    // Saving again after a refusal on the form reuses its id; the refused row stays until the next checkpoint.
    await tx.execute('delete from ascents where id = ? and pending = 1', [value.uuid!])
    await tx.execute(
      `insert into ascents (id, uuid, nid, pending, created_at, created_by, date_time, grade_fk, humidity, notes,
         rating, region_fk, route_fk, temperature, type)
       values (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        value.uuid!,
        value.uuid!,
        // Never a serial, so nothing can mistake it for one; nothing links a row that has not uploaded.
        -(1 + Math.floor(Math.random() * 2 ** 31)),
        new Date().toISOString(),
        user.nid,
        value.dateTime,
        value.gradeFk ?? null,
        value.humidity ?? null,
        value.notes || null,
        value.rating ?? null,
        route.region_fk,
        value.routeId,
        value.temperature ?? null,
        value.type,
      ],
    )
  },
  reopen: async (args, db) => {
    const route = await db.getOptional('select 1 from routes where nid = ?', [Number(args.routeId)])
    return route == null ? undefined : `/routes/${args.routeId}/ascents/add`
  },
}
