import { db } from '$lib/db/db.server'
import { queries, schema, type QueryContext } from '$lib/db/zero'
import { getUserPermissions } from '$lib/helper.server'
import { withValidation, type ReadonlyJSONValue } from '@rocicorp/zero'
import { handleGetQueriesRequest } from '@rocicorp/zero/server'
import { error } from '@sveltejs/kit'
import { jwtDecode } from 'jwt-decode'

export async function POST({ request }) {
  const jwt = request.headers.get('authorization')?.replace('Bearer ', '')
  const { sub } = jwt == null ? {} : jwtDecode(jwt)

  if (jwt == null || sub == null) {
    error(401)
  }

  const pageState = await getUserPermissions(db, sub)
  const context: QueryContext = { authUserId: sub, pageState }

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
