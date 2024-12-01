import { convertException } from '$lib'
import { getUser } from '$lib/helper.server'
import { searchResources } from '$lib/search.server'

export const GET = async ({ url, locals }) => {
  const user = await getUser(locals.user)
  const query = url.searchParams.get('q')

  try {
    const result = await searchResources(query, user)

    return new Response(JSON.stringify(result))
  } catch (exception) {
    const error = convertException(exception)
    return new Response(error, { status: 400 })
  }
}
