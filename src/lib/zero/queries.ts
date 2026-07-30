import { activitiesQueryDefs } from '$lib/entities/activity/queries'
import { areasQueryDefs } from '$lib/entities/area/queries'
import { ascentsQueryDefs } from '$lib/entities/ascent/queries'
import { blocksQueryDefs } from '$lib/entities/block/queries'
import { favoritesQueryDefs } from '$lib/entities/favorite/queries'
import { filesQueryDefs } from '$lib/entities/file/queries'
import { firstAscensionistsQueryDefs } from '$lib/entities/firstAscensionist/queries'
import { geolocationsQueryDefs } from '$lib/entities/geolocation/queries'
import { gradesQueryDefs } from '$lib/entities/grade/queries'
import { regionsQueryDefs } from '$lib/entities/region/queries'
import { rolePermissionsQueryDefs } from '$lib/entities/rolePermission/queries'
import { routesQueryDefs } from '$lib/entities/route/queries'
import { usersQueryDefs } from '$lib/entities/user/queries'
import { defineQueries } from '@rocicorp/zero'

export const queries = defineQueries({
  ...activitiesQueryDefs,
  ...areasQueryDefs,
  ...ascentsQueryDefs,
  ...blocksQueryDefs,
  ...favoritesQueryDefs,
  ...filesQueryDefs,
  ...firstAscensionistsQueryDefs,
  ...geolocationsQueryDefs,
  ...gradesQueryDefs,
  ...regionsQueryDefs,
  ...rolePermissionsQueryDefs,
  ...routesQueryDefs,
  ...usersQueryDefs,
})
