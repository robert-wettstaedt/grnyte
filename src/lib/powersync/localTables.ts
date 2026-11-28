import { column, Schema, Table } from '@powersync/web'
import { appSchema } from './schema'

/** The device's own tables, never synced: kept apart from `appSchema`, which mirrors exactly what the server sends. */
export const localTables = {
  /** An intent: a mutator call waiting to be sent. Insert-only, so each row is an upload and nothing stays. */
  mutations: new Table({ args: column.text, created_at: column.text, name: column.text }, { insertOnly: true }),
  /** What the server answered an intent, by its write id, until a waiting form read it or the person dismissed it. */
  write_outcomes: new Table(
    {
      args: column.text,
      created_at: column.text,
      data: column.text,
      field: column.text,
      message: column.text,
      name: column.text,
      status: column.text,
    },
    { localOnly: true },
  ),
}

/** The schema a device opens: the synced tables and its own. `appSchema.props` are resolved already, so they join
 *  as a list. */
export const deviceSchema = new Schema([
  ...appSchema.tables,
  ...Object.entries(localTables).map(([name, table]) => table.copyWithName(name)),
])
