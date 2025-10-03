import { NEXTCLOUD_USER_NAME } from '$env/static/private'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { files } from '$lib/db/schema'
import { getNextcloud } from '$lib/nextcloud/nextcloud.server'
import { eq } from 'drizzle-orm'
import { type BufferLike, type Headers, type ResponseDataDetailed } from 'webdav'

export async function GET({ locals, request, params }) {
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    const file = await db.query.files.findFirst({
      columns: { id: true },
      where: eq(files.path, params.resourcePath.startsWith('/') ? params.resourcePath : `/${params.resourcePath}`),
    })

    if (file == null) {
      return new Response(null, { status: 404 })
    }

    // Extract relevant headers from the request
    const reqHeaders = Array.from(request.headers.entries()).reduce((headers, [key, value]) => {
      // Include only 'accept' and 'range' headers
      if (['accept', 'range'].includes(key.toLowerCase())) {
        return { ...headers, [key]: value }
      }
      return headers
    }, {} as Headers)

    // Fetch file contents from Nextcloud with detailed response
    const result = await getNextcloud()?.getFileContents(`${NEXTCLOUD_USER_NAME}/${params.resourcePath}`, {
      details: true,
      headers: reqHeaders,
      signal: request.signal,
    })

    // Destructure the result to get data and other response details
    const { data, ...rest } = result as ResponseDataDetailed<ArrayBuffer>

    const resHeaders = new Headers(rest.headers)
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    resHeaders.delete('Set-Cookie')

    return new Response(data, {
      headers: resHeaders,
      status: rest.status,
      statusText: rest.statusText,
    })
  })
}
