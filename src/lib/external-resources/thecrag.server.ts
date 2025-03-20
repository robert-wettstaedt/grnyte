import { createDrizzleSupabaseClient, keyv } from '$lib/db/db.server'
import { generateSlug, routeExternalResourceTheCrag, type RouteExternalResourceTheCrag } from '$lib/db/schema'
import * as cheerio from 'cheerio'
import { eq } from 'drizzle-orm'
import type { ExternalResourceHandler } from './index.server'

export default {
  postUrl: 'https://www.thecrag.com/api/ascent/create?markupType=markdown&cookieAuth=1',

  query: async (query, blockId, cragName, sectorName, userExternalResource) => {
    const cacheKey = `thecrag-${blockId}-${generateSlug(query)}`

    const cragSlug = cragName != null ? generateSlug(cragName) : null
    const sectorSlug = sectorName != null ? generateSlug(sectorName) : null
    const querySlug = generateSlug(query)

    try {
      if (await keyv.has(cacheKey)) {
        return keyv.get(cacheKey)
      }

      const url = `https://www.thecrag.com/en/climbing/world/routes/search/${query}/with-gear-style/boulder/?sortby=popularity,desc`

      const response = await fetch(
        url,
        userExternalResource == null
          ? undefined
          : {
              headers: {
                Cookie: `ApacheSessionID=${userExternalResource.cookieTheCrag}`,
              },
            },
      )
      const html = await response.text()

      if (response.status >= 400) {
        console.log(`Failed query POST ${url}`)
        console.log(html)
        throw new Error(`Failed theCrag session check: ${response.status} ${response.statusText}`)
      }

      const $ = cheerio.load(html)
      const $rows = $('table.routetable tr')
      const $row = $rows.filter((_, row) => {
        const $anchor = $('.route a', row)
        const title = generateSlug($anchor.attr('title') ?? '')

        const isRoute = generateSlug($(row).attr('data-nodename') ?? '') === querySlug
        const isCrag = cragSlug != null && title.includes(cragSlug)
        const isSector = sectorSlug != null && title.includes(sectorSlug)

        return isRoute && (isCrag || isSector)
      })

      const id = Number($row.attr('data-nid'))

      if (!Number.isNaN(id)) {
        const grade = $('.pull-right', $row)
          .text()
          .replace(/\{\w+\}/, '')
          .trim()

        const description = $('.markdown p', $row).contents().not('.tags').text().trim()
        const tags = $('.markdown .tags', $row).text().trim()

        const data: RouteExternalResourceTheCrag = {
          externalResourcesFk: -1,
          description:
            description.startsWith('"') && description.endsWith('"')
              ? description.substring(1, description.length - 1)
              : description,
          grade,
          id: -1,
          name: $row.attr('data-nodename') ?? '',
          node: id,
          rating: $('.star', $row).length,
          tags,
          url: `https://www.thecrag.com/route/${id}`,
        }

        await keyv.set(cacheKey, data)

        return data
      }
    } catch (error) {
      console.error(JSON.stringify(error, null, 2))
    }

    return null
  },

  convertToRoute: (data, grades) => {
    const grade = grades.find((grade) =>
      data.grade == null
        ? undefined
        : data.grade.startsWith('V')
          ? grade.V === data.grade
          : grade.FB?.includes(data.grade),
    )

    return {
      blockFk: -1,
      createdAt: new Date(),
      createdBy: -1,
      description: data.description ?? null,
      externalResourcesFk: null,
      firstAscentYear: null,
      gradeFk: grade?.id ?? null,
      id: data.node ?? -1,
      name: data.name ?? '',
      rating: data.rating ?? null,
      slug: '',
    }
  },

  checkSession: async function (externalResourceId, userExternalResource, locals) {
    const db = await createDrizzleSupabaseClient(locals.supabase)

    const externalResource = await db(async (tx) =>
      externalResourceId == null
        ? null
        : tx.query.routeExternalResourceTheCrag.findFirst({
            where: eq(routeExternalResourceTheCrag.id, externalResourceId),
          }),
    )

    if (externalResource?.url == null || userExternalResource.cookieTheCrag == null) {
      return null
    }

    const res = await fetch(this.postUrl ?? '', {
      headers: {
        Cookie: `ApacheSessionID=${userExternalResource.cookieTheCrag}`,
        'Content-Type': 'application/json',
        Referer: externalResource.url,
      },
      method: 'POST',
    })
    const json = await res.json()

    if (res.status === 400) {
      if (typeof json.authAccountID === 'string') {
        return { account: json.authAccountID }
      }

      throw new Error('Your theCrag session is invalid')
    }

    console.log(`Failed checkSession POST ${this.postUrl}`)
    console.log(json)
    throw new Error(`Failed theCrag session check: ${res.status} ${res.statusText}`)
  },

  logAscent: async function (ascent, externalResourceId, userExternalResource, session, locals) {
    const db = await createDrizzleSupabaseClient(locals.supabase)

    const externalResourceTheCrag = await db(async (tx) =>
      externalResourceId == null
        ? null
        : tx.query.routeExternalResourceTheCrag.findFirst({
            where: eq(routeExternalResourceTheCrag.id, externalResourceId),
          }),
    )

    if (externalResourceTheCrag == null || userExternalResource.cookieTheCrag == null) {
      return
    }

    const res = await fetch(this.postUrl ?? '', {
      headers: {
        Cookie: `ApacheSessionID=${userExternalResource.cookieTheCrag}`,
        'Content-Type': 'application/json',
        Referer: externalResourceTheCrag.url ?? '',
      },
      method: 'POST',
      body: JSON.stringify({
        data: {
          account: session.account,
          node: externalResourceTheCrag.node,
          date: ascent.dateTime,
          tick: ascent.type,
          comment: ascent.notes ?? '',
          with: '',
          climbedGearStyle: 'boulder',
          difficultyFeedback: [],
          tag: {},
          version: 2,
        },
        role: 'Licensee Standard User',
      }),
    })

    if (res.status >= 400) {
      const json = await res.json()

      console.log(`Failed logAscent POST ${this.postUrl}`)
      console.log(json)
      throw new Error(`Unable to log theCrag ascent: ${res.status} ${res.statusText}`)
    }
  },
} as ExternalResourceHandler<RouteExternalResourceTheCrag, { account: string }>
