import type { Query } from '@rocicorp/zero'
import type { Schema } from './zero-schema'

/** The text half of a list query's arguments, spelled the same in all three schemas. */
export interface TextFilterArgs {
  content?: string
  references?: string
}

/** The three list queries that expose a text search. All carry `name` and `description`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic over any related-tree shape; these filters never read it
type SearchableQuery = Query<'areas' | 'blocks' | 'routes', Schema, any>

/**
 * What a text search matches, and what a backlink is, for every entity list that offers one.
 * `where` narrows rows without changing their shape, so the cast back to `Q` is sound.
 */
export function applyTextFilters<Q extends SearchableQuery>(query: Q, args: TextFilterArgs): Q {
  let q: SearchableQuery = query

  if (args.content != null) {
    const term = escapeLikeTerm(args.content)
    q = q.where((q) => q.or(q.cmp('name', 'ILIKE', `%${term}%`), q.cmp('description', 'ILIKE', `%${term}%`)))
  }

  // A reference token (`!blocks:42!`) inside a description is a backlink to that entity. The
  // token's own delimiters keep it exact, so `!areas:7!` does not match `!areas:71!`.
  if (args.references != null) {
    q = q.where('description', 'ILIKE', `%${args.references}%`)
  }

  return q as Q
}

/** Escapes `\`, `%` and `_` so user input matches literally in an `ILIKE` pattern (server and client agree on `\`). */
export function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&')
}
