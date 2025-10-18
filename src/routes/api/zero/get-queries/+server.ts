import { queries, schema, type QueryContext } from '$lib/db/zero'
import { withValidation, type ReadonlyJSONValue } from '@rocicorp/zero'
import { handleGetQueriesRequest } from '@rocicorp/zero/server'
import { error } from '@sveltejs/kit'

export async function POST({ locals, request }) {
  const authUserId = locals.session?.user.id

  if (authUserId == null) {
    error(401)
  }

  const context: QueryContext = { authUserId, pageState: locals }

  const q = await handleGetQueriesRequest((name, args) => getQuery(context, name, args), schema, request)

  return new Response(JSON.stringify(q))
}

// Build a map of queries with validation by name.
const validated = Object.fromEntries(Object.values(queries).map((q) => [q.queryName, withValidation(q)]))

function getQuery(context: QueryContext, name: string, args: readonly ReadonlyJSONValue[]) {
  const q = validated[name]
  if (!q) {
    throw new Error(`No such query: ${name}`)
  }
  return {
    // First param is the context for contextful queries.
    // `args` are validated using the `parser` you provided with
    // the query definition.
    query: q(context, ...args),
  }
}
