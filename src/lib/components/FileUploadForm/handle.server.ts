import * as schema from '$lib/db/schema'
import { inArray } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

export const handleFileUpload = async (
  db: PostgresJsDatabase<typeof schema>,
  filenames: string[],
  init?: Partial<schema.InsertEntityToStorageObject>,
) => {
  const nonThumbnailFilenames = filenames.filter((filename) => !filename.endsWith('.thumbnail.jpg'))

  const storageObjects = await db.query.storageObjects.findMany({
    where: inArray(schema.storageObjects.name, nonThumbnailFilenames),
  })

  const dbFiles = await db
    .insert(schema.entityToStorageObjects)
    .values(storageObjects.map((storageObject) => ({ ...init, storageObjectId: storageObject.id })))
    .returning()

  return dbFiles
}
