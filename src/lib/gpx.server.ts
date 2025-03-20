import { NEXTCLOUD_USER_NAME } from '$env/static/private'
import { PUBLIC_APPLICATION_NAME, PUBLIC_TOPO_EMAIL } from '$env/static/public'
import { getToposOfArea } from '$lib/blocks.server'
import Labels from '$lib/components/TopoViewer/components/Labels'
import Route from '$lib/components/TopoViewer/components/Route'
import { config } from '$lib/config'
import * as schema from '$lib/db/schema'
import type { InferResultType, NestedArea } from '$lib/db/types'
import { convertMarkdownToHtml } from '$lib/markdown'
import { getNextcloud, searchNextcloudFile } from '$lib/nextcloud/nextcloud.server'
import { type TopoRouteDTO } from '$lib/topo'
import type { Session } from '@supabase/supabase-js'
import { error } from '@sveltejs/kit'
import { eq, inArray } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { encode as encodeHtml } from 'html-entities'
import { minify, type Options } from 'html-minifier'
import sharp from 'sharp'
import stringToColor from 'string-to-color'
import { render } from 'svelte/server'
import type { BufferLike, FileStat, ResponseDataDetailed } from 'webdav'

interface TopoFile {
  base64: string
  width?: number
  height?: number
  scale: number
}

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
      <time>${encodeHtml(block.createdAt.toISOString())}</time>
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
      <time>${area.createdAt.toISOString()}</time>
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
  async function getTopoFile(stat: FileStat) {
    const content = await nextcloud?.getFileContents(`${NEXTCLOUD_USER_NAME}/${stat.filename}`, { details: true })
    const { data } = content as ResponseDataDetailed<BufferLike>

    const image = sharp(data)
    const rawMetadata = await image.metadata()
    const resized = await image.resize({ width: config.files.resizing.thumbnail.width }).toBuffer()
    const resizedMetadata = await sharp(resized).metadata()

    if (resizedMetadata.width === undefined || rawMetadata.width === undefined) {
      throw new Error('Metadata width is undefined')
    }

    const scale = resizedMetadata.width / rawMetadata.width
    const base64 = resized.toString('base64')

    return {
      base64,
      width: resizedMetadata.width,
      height: resizedMetadata.height,
      scale,
    } satisfies TopoFile
  }

  const nextcloud = getNextcloud()

  const allRoutes = blocks.flatMap((block) => block.routes)
  const routeFiles = await db.query.files.findMany({
    where: inArray(
      schema.files.routeFk,
      allRoutes.map((route) => route.id),
    ),
  })

  return await Promise.all(
    blocks.map(async (block) => {
      const topos = await Promise.all(
        block.topos.map(async (topo) => {
          const stat = await searchNextcloudFile(topo.file)
          const topoFile = await getTopoFile(stat)
          return { ...topo, file: topoFile }
        }),
      )

      const routes = await Promise.all(
        block.routes.map(async (route) => {
          const files = routeFiles.filter((file) => file.routeFk === route.id)

          const stats = await Promise.all(files.flatMap((file) => searchNextcloudFile(file)))
          const topoFiles = await Promise.all(
            stats.filter((stat) => stat.mime?.includes('image')).map((stat) => getTopoFile(stat)),
          )

          const description =
            route.description == null ? null : await convertMarkdownToHtml(route.description, db, 'strong')

          return {
            ...(route as InferResultType<
              'routes',
              { firstAscents: { with: { firstAscensionist: true } }; tags: true }
            >),
            description,
            files: topoFiles,
          }
        }),
      )

      const color = stringToColor(block.area.type === 'crag' ? block.area.id : block.area.parentFk)

      return { ...block, color, routes, topos }
    }),
  )
}

const renderBlockHtml = (
  block: Awaited<ReturnType<typeof loadBlockFiles>>[0],
  grades: schema.Grade[],
  gradingScale: schema.UserSettings['gradingScale'],
): string => {
  return [
    block.topos
      .map(
        (topo) => `
        <div style="margin-top: 16px; position: relative;">
          ${renderTopo(topo)}

          ${topo.routes
            .map((topoRoute, index) => {
              const route = block.routes.find((route) => route.id === topoRoute.routeFk)

              if (route == null) {
                return ''
              }

              return renderRoute(route, grades, gradingScale, index)
            })
            .join('')}
        </div>`,
      )
      .join('\n'),

    '<hr />',

    block.routes
      .filter(
        (route) => !block.topos.flatMap((topo) => topo.routes).some((topoRoute) => topoRoute.routeFk === route.id),
      )
      .map((route) => renderRoute(route, grades, gradingScale))
      .join(''),
  ].join('\n')
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
    <div style="margin-top: 16px; position: relative;">
      ${block.topos
        .map((topo) => {
          if (topo.blockFk !== route.blockFk) {
            return ''
          }

          const topoRoute = topo.routes.find((topoRoute) => topoRoute.routeFk === route.id)

          if (topoRoute == null) {
            return ''
          }

          return renderTopo({ ...topo, routes: [topoRoute] })
        })
        .join('\n')}
    </div>

    ${renderRouteDescription(route)}

    ${route.files
      .map(({ base64, height, width }) => {
        return `
        <div style="margin-top: 16px;">
          <img src="data:image/jpeg;base64,${base64}" width="${width}" height="${height}" />
        </div>`
      })
      .join('\n')}
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

const renderTopo = (topo: InferResultType<'topos'> & { file: TopoFile; routes: TopoRouteDTO[] }): string => {
  const { base64, scale, height = 0, width = 0 } = topo.file

  return `
    <div style="position: relative;">
      <img src="data:image/jpeg;base64,${base64}" width="${width}" height="${height}" />

      <svg
        height="${height}"
        style="position: absolute; top: 0; left: 0; right: 0; bottom: 0;"
        viewBox="0 0 ${width} ${height}"
        width="${width}"
        xmlns="http://www.w3.org/2000/svg"
      >
        ${topo.routes.map(
          (_, index, routes) =>
            render(Route, {
              props: {
                height,
                index,
                routes,
                scale,
                width,
              },
            }).body,
        )}
      </svg>

      ${
        render(Labels, {
          props: {
            routes: topo.routes,
            scale,
            getRouteKey: (_, index) => index + 1,
          },
        }).body
      }
    </div>
  `
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
