import { createDrizzleSupabaseClient, keyv } from '$lib/db/db.server'
import { generateSlug, routeExternalResource8a, type RouteExternalResource8a } from '$lib/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { ExternalResourceHandler } from './index.server'

const QueryResponse8a = z.object({
  items: z.array(
    z.object({
      areaName: z.union([z.string(), z.null()]),
      areaSlug: z.union([z.string(), z.null()]),
      averageRating: z.number(),
      category: z.number(),
      countryName: z.string(),
      countrySlug: z.string(),
      cragName: z.string(),
      cragSlug: z.string(),
      difficulty: z.string(),
      flashOnsightRate: z.number(),
      gradeIndex: z.number(),
      score: z.number(),
      sectorName: z.string(),
      sectorSlug: z.string(),
      totalAscents: z.number(),
      totalRecommendedRate: z.number(),
      type: z.number(),
      zlaggableId: z.number(),
      zlaggableName: z.string(),
      zlaggableSlug: z.string(),
    }),
  ),
})
export type QueryResponse8a = z.infer<typeof QueryResponse8a>

export default {
  postUrl: 'https://www.8a.nu/api/ascents',

  query: async (query, blockId, cragName, sectorName) => {
    const cacheKey = `8a-${blockId}-${generateSlug(query)}`

    const cragSlug = cragName != null ? generateSlug(cragName) : null
    const sectorSlug = sectorName != null ? generateSlug(sectorName) : null
    const querySlug = generateSlug(query)

    const queryItems = async (query: string) => {
      const searchParams = new URLSearchParams({
        query,
        pageIndex: '0',
        pageSize: '20',
        'entityTypes[]': '3',
        showOnMap: 'false',
      })

      const url = `https://www.8a.nu/api/unification/collection/v1/web/search?${searchParams.toString()}`
      const response = await fetch(url)
      const data = await response.json()

      const parsed = QueryResponse8a.parse(data)
      const item = parsed.items
        .filter((item) => {
          const _cragSlug = generateSlug(item.cragName)
          const _sectorSlug = generateSlug(item.sectorName)

          return (
            generateSlug(item.zlaggableName) === querySlug &&
            [cragSlug, sectorSlug].some((slug) => _cragSlug === slug || _sectorSlug === slug)
          )
        })
        .toSorted((a, b) => b.totalAscents - a.totalAscents)
        .at(0)

      return item
    }

    try {
      if (await keyv.has(cacheKey)) {
        return keyv.get(cacheKey)
      }

      let extendedQuery = `${query}+${cragName ?? ''}`
      let item = await queryItems(extendedQuery)

      if (item == null) {
        extendedQuery = `${query}+${sectorName ?? ''}`
        item = await queryItems(extendedQuery)
      }

      if (item == null) {
        item = await queryItems(query)
      }

      if (item != null) {
        const data: RouteExternalResource8a = {
          ...item,
          externalResourcesFk: -1,
          id: -1,
          regionFk: -1,
          url: `https://www.8a.nu/crags/bouldering/${item.countrySlug}/${item.cragSlug}/sectors/${item.sectorSlug}/routes/${item.zlaggableSlug}`,
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
      data.difficulty == null
        ? undefined
        : data.difficulty.startsWith('V')
          ? grade.V === data.difficulty
          : grade.FB?.includes(data.difficulty),
    )

    return {
      blockFk: -1,
      createdAt: new Date(),
      createdBy: -1,
      description: null,
      externalResourcesFk: null,
      firstAscentYear: null,
      gradeFk: grade?.id ?? null,
      id: data.zlaggableId ?? -1,
      name: data.zlaggableName ?? '',
      rating: Math.round(((data.averageRating ?? 0) / 5) * 3),
      slug: data.zlaggableSlug ?? '',
      userRating: null,
      userGradeFk: null,
      areaFks: [],
      areaIds: '',
      regionFk: -1,
    }
  },

  /**
   * Intentionally send a post request to the 8a API without the body.
   * If the session is valid, the server will respond with a 400 status code.
   * If the session is invalid, the server will respond with a 401 status code.
   */
  checkSession: async function (_, userSettings) {
    if (userSettings.cookie8a == null) {
      return null
    }

    const res = await fetch(this.postUrl ?? '', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `connect.sid=${userSettings.cookie8a}`,
      },
    })

    if (res.status === 400) {
      return true
    }

    if (res.status === 401) {
      throw new Error('Your 8a session is invalid')
    }

    const json = await res.json()
    console.log(`Failed checkSession POST ${this.postUrl}`)
    console.log(json)
    throw new Error(`Failed 8a session check: ${res.status} ${res.statusText}`)
  },

  logAscent: async function (ascent, externalResourceId, userSettings, _, locals) {
    const db = await createDrizzleSupabaseClient(locals.supabase)

    const externalResource = await db(async (tx) =>
      externalResourceId == null
        ? null
        : tx.query.routeExternalResource8a.findFirst({
            where: eq(routeExternalResource8a.id, externalResourceId),
          }),
    )

    if (externalResource == null || userSettings.cookie8a == null) {
      return
    }

    const type = (() => {
      switch (ascent.type) {
        case 'attempt':
          return 'go'

        case 'flash':
          return 'f'

        default:
          return 'rp'
      }
    })()

    const res = await fetch(this.postUrl ?? '', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `connect.sid=${userSettings.cookie8a}`,
      },
      body: JSON.stringify({
        zlaggable: {
          category: externalResource.category,
          areaName: externalResource.areaName,
          areaSlug: externalResource.areaSlug,
          countrySlug: externalResource.countrySlug,
          cragSlug: externalResource.cragSlug,
          cragName: externalResource.cragName,
          sectorSlug: externalResource.sectorSlug,
          sectorName: externalResource.sectorName,
          zlaggableSlug: externalResource.zlaggableSlug,
          zlaggableName: externalResource.zlaggableName,
        },
        ascent: {
          type,
          date: ascent.dateTime,
          comment: ascent.notes ?? '',
          repeat: ascent.type === 'repeat' ? true : false,

          gradeProposal: {
            isHard: false,
            isSoft: false,
            refinement: '',
            gradeIndex: externalResource.gradeIndex,
          },

          ascentId: 0,
          platform: 'eight_a',
          subType: null,
          tries: 0,
          isPrivateComment: false,
          isPublicComment: false,
          duplicate: false,
          traditional: false,
          rating: 0,
          recommend: false,
          typeOfClimbing: {
            athletic: false,
            cruxy: false,
            sloper: false,
            crimpy: false,
            technical: false,
            endurance: false,
          },
          steepness: {
            overhang: false,
            vertical: false,
            slab: false,
            roof: false,
          },
          safetyIssues: {
            badAnchor: false,
            badBolts: false,
            highFirstBolt: false,
            looseRock: false,
            badClippingPosition: false,
            reboltedByMe: false,
            anchorReplacedByMe: false,
          },
          safety: 2,
          Chipped: false,
          NoScore: false,
          firstAscent: false,
          withKneepad: false,
          project: false,
        },
      }),
    })

    if (res.status >= 400) {
      const json = await res.json()

      console.log(`Failed logAscent POST ${this.postUrl}`)
      console.log(json)
      throw new Error(`Unable to log 8a ascent: ${res.status} ${res.statusText}`)
    }
  },
} as ExternalResourceHandler<RouteExternalResource8a, true>
