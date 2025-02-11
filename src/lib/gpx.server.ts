import { PUBLIC_APPLICATION_NAME, PUBLIC_TOPO_EMAIL } from '$env/static/public'
import { getToposOfArea } from '$lib/blocks.server'
import * as schema from '$lib/db/schema'
import type { InferResultType, NestedArea } from '$lib/db/types'
import { convertMarkdownToHtml } from '$lib/markdown'
import type { Session } from '@supabase/supabase-js'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { encode as encodeHtml } from 'html-entities'
import { minify, type Options } from 'html-minifier'
import { DateTime } from 'luxon'
import stringToColor from 'string-to-color'

export const getAreaGPX = async (areaId: number, db: PostgresJsDatabase<typeof schema>, session?: Session | null) => {
  if (session == null) {
    error(404)
  }

  const { area, blocks } = await getToposOfArea(areaId, db)

  const parkingLocations = [
    ...area.parkingLocations,
    ...area.areas.flatMap((area) => area.parkingLocations),
    ...area.areas.flatMap((area) => area.areas).flatMap((area) => area.parkingLocations),
  ]

  const grades = await db.query.grades.findMany()

  const user = await db.query.users.findFirst({
    where: eq(schema.users.authUserFk, session.user.id),
    with: {
      userSettings: true,
    },
  })

  const gradingScale = user?.userSettings?.gradingScale ?? 'FB'

  const enrichedBlocks = await loadBlockFiles(blocks, db)

  const xml = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
  <gpx
    version="1.1"
    creator="${PUBLIC_APPLICATION_NAME}"
    xmlns="http://www.topografix.com/GPX/1/1"
    xmlns:osmand="https://osmand.net"
    xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
      <metadata>
        <name>${encodeHtml(area.name)}</name>
        <author>
          <email>${encodeHtml(PUBLIC_TOPO_EMAIL)}</email>
        </author>
        <copyright>
          <year>${encodeHtml(String(new Date().getFullYear()))}</year>
          <license>
            <href>https://creativecommons.org/licenses/by-nc-sa/4.0/</href>
          </license>
        </copyright>
      </metadata>

  ${enrichedBlocks
    .map((block) => {
      return `
    <wpt lat="${block.geolocation!.lat}" lon="${block.geolocation!.long}">
      <time>${encodeHtml(DateTime.fromSQL(block.createdAt).toISO())}</time>
      <name>${encodeHtml([(block.area as NestedArea).parent?.name, block.area.name, block.name].join(' / '))}</name>
      <desc>${prepareHtml(renderBlockHtml(block, grades, gradingScale))}</desc>
      <extensions>
        <osmand:color>${block.color}</osmand:color>
        <osmand:background>circle</osmand:background>
        <osmand:icon>natural_peak</osmand:icon>
      </extensions>
    </wpt>

    ${block.routes
      .map((route) => {
        return `
    <wpt lat="${block.geolocation!.lat}" lon="${block.geolocation!.long}">
      <name>${encodeHtml(renderRouteName(route, grades, gradingScale, false))}</name>
      <desc>${prepareHtml(renderRouteHtml(block, route, grades, gradingScale))}</desc>
      <extensions>
        <osmand:color>${block.color}</osmand:color>
        <osmand:background>circle</osmand:background>
        <osmand:icon>sport_climbing</osmand:icon>
      </extensions>
    </wpt>`
      })
      .join('')}`
    })
    .join('')}


    ${parkingLocations
      .map(
        (parkingLocation, index) => `
    <wpt lat="${parkingLocation.lat}" lon="${parkingLocation.long}">
      <time>${DateTime.fromSQL(area.createdAt).toISO()}</time>
      <name>Parking${area.parkingLocations.length > 1 ? ` ${index + 1}` : ''}</name>
      <extensions>
        <osmand:color>#a71de1</osmand:color>
        <osmand:background>circle</osmand:background>
        <osmand:icon>amenity_parking</osmand:icon>
      </extensions>
    </wpt>`,
      )
      .join('')}
  </gpx>`

  return xml
}

const loadBlockFiles = async (
  blocks: Awaited<ReturnType<typeof getToposOfArea>>['blocks'],
  db: PostgresJsDatabase<typeof schema>,
) => {
  return await Promise.all(
    blocks.map(async (block) => {
      const routes = await Promise.all(
        block.routes.map(async (route) => {
          const description =
            route.description == null ? null : await convertMarkdownToHtml(route.description, db, 'strong')

          return {
            ...(route as InferResultType<
              'routes',
              { firstAscents: { with: { firstAscensionist: true } }; tags: true }
            >),
            description,
          }
        }),
      )

      const color = stringToColor(block.area.type === 'crag' ? block.area.id : block.area.parentFk)

      return { ...block, color, routes }
    }),
  )
}

const renderBlockHtml = (
  block: Awaited<ReturnType<typeof loadBlockFiles>>[0],
  grades: schema.Grade[],
  gradingScale: schema.UserSettings['gradingScale'],
): string => {
  return [block.routes.map((route) => renderRoute(route, grades, gradingScale)).join('')].join('\n')
}

const renderRouteHtml = (
  block: Awaited<ReturnType<typeof loadBlockFiles>>[0],
  route: Awaited<ReturnType<typeof loadBlockFiles>>[0]['routes'][0],
  grades: schema.Grade[],
  gradingScale: schema.UserSettings['gradingScale'],
): string => {
  return `
    <h4>${[(block.area as NestedArea).parent?.name, block.area.name, block.name].join(' / ')}</h4>
    <h3>${renderRouteName(route, grades, gradingScale)}</h3>
    ${renderRouteDescription(route)}
  `
}

const renderRouteName = (
  route: schema.Route,
  grades: schema.Grade[],
  gradingScale: schema.UserSettings['gradingScale'],
  specialCharacters = true,
): string => {
  return [
    route.name.length === 0 ? '?' : route.name,
    route.gradeFk == null ? null : grades.find((grade) => grade.id === route.gradeFk)?.[gradingScale],
    route.rating == null ? null : new Array(route.rating).fill(specialCharacters ? '⭐️' : '*').join(''),
  ]
    .filter(Boolean)
    .join(specialCharacters ? ' • ' : ' - ')
}

const renderRouteDescription = (
  route: InferResultType<'routes', { firstAscents: { with: { firstAscensionist: true } }; tags: true }>,
): string => {
  return [
    route.firstAscents.length === 0 && route.firstAscentYear == null
      ? null
      : `<p style="margin-top: 16px;">
            ${route.firstAscents.map((firstAscent) => firstAscent.firstAscensionist.name).join(', ')}

            ${route.firstAscentYear ?? ''}
          </p>`,

    route.tags.length === 0
      ? null
      : `<div style="margin-top: 16px;">
          ${route.tags.map((tag) => `<span style="margin-right: 4px;">#${tag.tagFk}</span>`).join('')}
        </div>`,

    route.description == null ? null : `<p style="margin-top: 16px;">${route.description}</p>`,
  ]
    .filter(Boolean)
    .join('\n')
}

const renderRoute = (
  route: InferResultType<'routes', { firstAscents: { with: { firstAscensionist: true } }; tags: true }>,
  grades: schema.Grade[],
  gradingScale: schema.UserSettings['gradingScale'],
  key?: number,
): string => {
  return `
    <div style="margin-top: 4px;">
      <h3>
        ${key == null ? '' : `<strong>${key + 1}.</strong>`}

        ${renderRouteName(route, grades, gradingScale)}
      </h3>

      ${renderRouteDescription(route)}
    </div>`
}

const prepareHtml = (str: string): string => {
  const opts: Options = {
    caseSensitive: false,
    collapseBooleanAttributes: true,
    collapseInlineTagWhitespace: false,
    collapseWhitespace: true,
    conservativeCollapse: false,
    continueOnParseError: true,
    decodeEntities: true,
    includeAutoGeneratedTags: false,
    keepClosingSlash: false,
    maxLineLength: 0,
    minifyCSS: true,
    minifyJS: true,
    preserveLineBreaks: false,
    preventAttributesEscaping: false,
    processConditionalComments: true,
    processScripts: ['text/html'],
    removeAttributeQuotes: true,
    removeComments: true,
    removeEmptyAttributes: true,
    removeEmptyElements: false,
    removeOptionalTags: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    removeTagWhitespace: true,
    sortAttributes: true,
    sortClassName: true,
    trimCustomFragments: true,
    useShortDoctype: true,
  }

  return encodeXml(encodeHtml(minify(str, opts)))
}

const encodeXml = (str: string): string => {
  let isInBase64 = false
  let newStr = ''

  for (let i = 0; i < str.length; i++) {
    const substr = str.substring(i)
    const c = str[i]
    const cc = str.charCodeAt(i)

    if (isInBase64) {
      if (c === '"' || substr.indexOf('&quot;') === 0) {
        isInBase64 = false
      } else {
        newStr += c
        continue
      }
    }

    if (substr.indexOf('base64,') === 0) {
      isInBase64 = true
    }

    newStr += cc >= 127 ? `&#${cc};` : c
  }

  return newStr
}
