import { config } from '$lib/config'

export async function GET({ locals, url }) {
  const resource = url.searchParams.get('resource')

  if (!locals.userPermissions?.includes('data.read') || resource == null) {
    return new Response(null, { status: 404 })
  }

  try {
    const response = await fetch(resource)

    if (!response.ok) {
      throw new Error('Failed to fetch resource')
    }

    return new Response(response.body, { headers: config.cors.headers })
  } catch (error) {
    return new Response(null, { status: 400 })
  }
}
