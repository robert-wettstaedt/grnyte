import type { Schema } from '$lib/db/zero'
import { convertAreaSlugRaw } from '$lib/helper'
import type { Query } from '@rocicorp/zero'
import { error } from '@sveltejs/kit'
import type { LayoutLoad } from './$types'

const getRouteDbFilterRaw = (
  params: Record<string, string | undefined>,
  q: Query<Schema, 'routes'>,
): Query<Schema, 'routes'> => {
  return Number.isNaN(Number(params.routeSlug))
    ? q.where('slug', params.routeSlug!)
    : q.where('id', Number(params.routeSlug))
}

export const load = (async ({ parent, params }) => {
  const { areaId } = convertAreaSlugRaw(params)
  const { z } = await parent()

  if (areaId == null || params.blockSlug == null) {
    error(404)
  }

  const routeQuery = z.query.blocks
    .where('slug', params.blockSlug)
    .where('areaFk', areaId)
    .whereExists('routes', (q) => getRouteDbFilterRaw(params, q))
    .related('routes', (q) =>
      getRouteDbFilterRaw(params, q)
        .related('tags')
        .related('externalResources', (q) =>
          q.related('externalResource27crags').related('externalResource8a').related('externalResourceTheCrag'),
        )
        .related('firstAscents', (q) => q.related('firstAscensionist', (q) => q.related('user'))),
    )
    .related('topos')
    .one()

  return { routeQuery }
}) satisfies LayoutLoad
