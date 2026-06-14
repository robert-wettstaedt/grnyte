import { NEXTCLOUD_USER_NAME } from '$env/static/private'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { files } from '$lib/db/schema'
import { getNextcloud } from '$lib/nextcloud/nextcloud.server'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import { type Headers, type ResponseDataDetailed } from 'webdav'

export async function GET({ locals, request, params }) {
  // The DB stores paths with a leading slash; the URL segment may or may not.
  const resourcePath = params.resourcePath.startsWith('/') ? params.resourcePath : `/${params.resourcePath}`

  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    // RLS scopes this lookup to files the current user is allowed to read, so a
    // missing row is indistinguishable from "not authorized" — both are a 404.
    const file = await db.query.files.findFirst({
      columns: { id: true },
      where: eq(files.path, resourcePath),
    })

    if (file == null) {
      error(404, 'File not found')
    }

    // Forward only the headers Nextcloud needs to serve partial/negotiated
    // content; everything else (auth, cookies, etc.) must not leak upstream.
    const reqHeaders = Array.from(request.headers.entries()).reduce((headers, [key, value]) => {
      if (['accept', 'range'].includes(key.toLowerCase())) {
        return { ...headers, [key]: value }
      }
      return headers
    }, {} as Headers)

    let result: ResponseDataDetailed<ArrayBuffer> | undefined
    try {
      result = (await getNextcloud().getFileContents(`${NEXTCLOUD_USER_NAME}${resourcePath}`, {
        details: true,
        headers: reqHeaders,
        signal: request.signal,
      })) as ResponseDataDetailed<ArrayBuffer>
    } catch (err) {
      // The DB knows about the file but Nextcloud failed to deliver it.
      console.error(`Failed to load file contents for "${resourcePath}":`, err)
      error(502, 'Failed to load file')
    }

    const { data, ...rest } = result

    const resHeaders = new Headers(rest.headers)
    resHeaders.delete('Set-Cookie')
    // These are private, RLS-gated assets, so let the browser cache them per
    // session without making them publicly cacheable by shared proxies.
    if (!resHeaders.has('Cache-Control')) {
      resHeaders.set('Cache-Control', 'private, max-age=3600')
    }

    return new Response(data, {
      headers: resHeaders,
      status: rest.status,
      statusText: rest.statusText,
    })
  })
}
