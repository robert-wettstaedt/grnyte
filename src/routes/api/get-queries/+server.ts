import { queries, schema, type QueryContext } from '$lib/db/zero'
import { withValidation, type ReadonlyJSONValue } from '@rocicorp/zero'
import { handleGetQueriesRequest } from '@rocicorp/zero/server'
import { error } from '@sveltejs/kit'

export async function POST({ locals, request }) {
  const jwt = request.headers.get('authorization')?.replace('Bearer ', '')
  const { data: userData, error: authError } = await locals.supabase.auth.getUser(jwt)

  if (userData == null || authError != null) {
    error(401)
  }

  const q = await handleGetQueriesRequest((name, args) => getQuery(userData.user, name, args), schema, request)

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
