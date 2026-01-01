import { db } from '$lib/db/db.server'
import { queries, schema } from '$lib/db/zero'
import { getUserPermissions } from '$lib/helper.server'
import { mustGetQuery } from '@rocicorp/zero'
import { handleQueryRequest } from '@rocicorp/zero/server'
import { error } from '@sveltejs/kit'
import { jwtDecode } from 'jwt-decode'

export async function POST({ request }) {
  const jwt = request.headers.get('authorization')?.replace('Bearer ', '')
  const { sub } = jwt == null ? {} : jwtDecode(jwt)

  if (jwt == null || sub == null) {
    error(401)
  }

  const pageState = await getUserPermissions(db, sub)
  const ctx = { authUserId: sub, pageState }

  const q = await handleQueryRequest((name, args) => mustGetQuery(queries, name).fn({ args, ctx }), schema, request)

  return new Response(JSON.stringify(q))
}
