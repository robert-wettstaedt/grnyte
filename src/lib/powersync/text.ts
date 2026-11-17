/**
 * A list's text search in JS, as Postgres's ILIKE matched it: `content` in the name or description, `namePrefix`
 * at the start of the name, `references` (a `!type:id!` backlink token) in the description. SQLite's LIKE folds
 * ASCII only.
 */
export function matchesText({
  content,
  namePrefix,
  references,
}: {
  content?: string
  namePrefix?: string
  references?: string
}) {
  const needle = content?.toLocaleLowerCase()
  const prefix = namePrefix?.toLocaleLowerCase()
  const token = references?.toLocaleLowerCase()
  return (row: { description?: null | string; name?: null | string }) => {
    const name = (row.name ?? '').toLocaleLowerCase()
    const description = (row.description ?? '').toLocaleLowerCase()
    return (
      (needle == null || name.includes(needle) || description.includes(needle)) &&
      (prefix == null || name.startsWith(prefix)) &&
      (token == null || description.includes(token))
    )
  }
}
