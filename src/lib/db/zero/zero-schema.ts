import {
  REGION_PERMISSION_ADMIN,
  REGION_PERMISSION_DELETE,
  REGION_PERMISSION_EDIT,
  REGION_PERMISSION_READ,
  type RegionPermission,
  type SupabaseToken,
} from '$lib/auth'
import {
  ANYONE_CAN,
  definePermissions,
  type CustomMutatorDefs,
  type ExpressionBuilder,
  type PermissionsConfig,
} from '@rocicorp/zero'
import { schema, type Schema } from './zero-schema.gen'

export { schema, type Schema }

export const permissions = definePermissions<SupabaseToken, Schema>(schema, () => {
  const regionMembersCan = [
    (authData: SupabaseToken, eb: ExpressionBuilder<Schema, 'regions'>) =>
      eb.exists('members', (q) => q.where('authUserFk', '=', authData.sub ?? '').where('isActive', '=', true)),
  ]

  const regionMembersWithRoleCan = (permission: RegionPermission) => [
    (
      authData: SupabaseToken,
      eb: ExpressionBuilder<
        Schema,
        | 'activities'
        | 'areas'
        | 'ascents'
        | 'blocks'
        | 'bunnyStreams'
        | 'files'
        | 'firstAscensionists'
        | 'geolocations'
        | 'regionInvitations'
        | 'routeExternalResource27crags'
        | 'routeExternalResource8a'
        | 'routeExternalResources'
        | 'routeExternalResourceTheCrag'
        | 'routes'
        | 'routesToFirstAscensionists'
        | 'routesToTags'
        | 'topoRoutes'
        | 'topos'
      >,
    ) =>
      eb.exists('region', (q) =>
        q.whereExists('members', (q) =>
          q
            .where('authUserFk', '=', authData.sub ?? '')
            .where('isActive', '=', true)
            .whereExists('rolePermission', (q) => q.where('permission', '=', permission)),
        ),
      ),
  ]

  const authenticatedUsersCan = [
    (authData: SupabaseToken, eb: ExpressionBuilder<Schema, keyof Schema['tables']>) =>
      eb.cmpLit(authData.sub!, 'IS NOT', null),
  ]

  const userCan = [
    (
      authData: SupabaseToken,
      eb: ExpressionBuilder<Schema, 'pushSubscriptions' | 'regionMembers' | 'users' | 'userSettings'>,
    ) => eb.cmp('authUserFk', '=', authData.sub ?? ''),
  ]

  const appAdminCan = [
    (authData: SupabaseToken, eb: ExpressionBuilder<Schema, keyof Schema['tables']>) =>
      eb.cmpLit(authData.user_role!, '=', 'app_admin'),
  ]

  return {
    /**
     *
     *
     * === GLOBALS ===
     *
     *
     */

    rolePermissions: {
      row: {
        select: ANYONE_CAN,
      },
    },
    userRoles: {
      row: {
        select: ANYONE_CAN,
      },
    },
    users: {
      row: {
        select: authenticatedUsersCan,
        update: {
          preMutation: userCan,
          postMutation: userCan,
        },
      },
    },
    userSettings: {
      row: {
        select: userCan,
        insert: userCan,
        update: {
          preMutation: userCan,
          postMutation: userCan,
        },
      },
    },
    pushSubscriptions: {
      row: {
        select: userCan,
        delete: userCan,
        insert: userCan,
        update: {
          preMutation: userCan,
          postMutation: userCan,
        },
      },
    },
    regions: {
      row: {
        select: [...appAdminCan, ...regionMembersCan],
        delete: appAdminCan,
        insert: authenticatedUsersCan,
        update: {
          preMutation: [...appAdminCan, ...regionMembersCan],
          postMutation: [...appAdminCan, ...regionMembersCan],
        },
      },
    },
    regionMembers: {
      row: {
        select: authenticatedUsersCan,
        delete: [...appAdminCan, ...userCan],
        insert: [...appAdminCan, ...userCan],
        update: {
          preMutation: [...appAdminCan, ...userCan],
          postMutation: [...appAdminCan, ...userCan],
        },
      },
    },
    regionInvitations: {
      row: {
        select: ANYONE_CAN,
        insert: regionMembersWithRoleCan(REGION_PERMISSION_ADMIN),
        update: {
          preMutation: ANYONE_CAN,
          postMutation: ANYONE_CAN,
        },
      },
    },
    grades: {
      row: {
        select: authenticatedUsersCan,
      },
    },
    tags: {
      row: {
        select: authenticatedUsersCan,
        delete: appAdminCan,
        insert: appAdminCan,
        update: {
          preMutation: appAdminCan,
          postMutation: appAdminCan,
        },
      },
    },

    /**
     *
     *
     * === REGION-BASED ===
     *
     *
     */

    activities: {
      row: {
        select: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        delete: [
          ...regionMembersWithRoleCan(REGION_PERMISSION_DELETE),
          (authData, eb) => eb.exists('user', (q) => q.where('authUserFk', '=', authData.sub ?? '')),
        ],
        insert: regionMembersWithRoleCan(REGION_PERMISSION_READ),
      },
    },
    areas: {
      row: {
        select: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        delete: regionMembersWithRoleCan(REGION_PERMISSION_DELETE),
        insert: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
        update: {
          preMutation: regionMembersWithRoleCan(REGION_PERMISSION_READ),
          postMutation: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        },
      },
    },
    ascents: {
      row: {
        select: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        delete: [
          ...regionMembersWithRoleCan(REGION_PERMISSION_ADMIN),
          (authData, eb) => eb.exists('author', (q) => q.where('authUserFk', '=', authData.sub ?? '')),
        ],
        insert: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        update: {
          preMutation: [
            ...regionMembersWithRoleCan(REGION_PERMISSION_ADMIN),
            (authData, eb) => eb.exists('author', (q) => q.where('authUserFk', '=', authData.sub ?? '')),
          ],
          postMutation: [
            ...regionMembersWithRoleCan(REGION_PERMISSION_ADMIN),
            (authData, eb) => eb.exists('author', (q) => q.where('authUserFk', '=', authData.sub ?? '')),
          ],
        },
      },
    },
    blocks: {
      row: {
        select: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        delete: regionMembersWithRoleCan(REGION_PERMISSION_DELETE),
        insert: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
        update: {
          preMutation: regionMembersWithRoleCan(REGION_PERMISSION_READ),
          postMutation: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        },
      },
    },
    bunnyStreams: {
      row: {
        select: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        delete: [
          ...regionMembersWithRoleCan(REGION_PERMISSION_ADMIN),
          (authData, eb) =>
            eb.exists('file', (q) =>
              q.whereExists('ascent', (q) =>
                q.whereExists('author', (q) => q.where('authUserFk', '=', authData.sub ?? '')),
              ),
            ),
        ],
        insert: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        update: {
          preMutation: [
            ...regionMembersWithRoleCan(REGION_PERMISSION_ADMIN),
            (authData, eb) =>
              eb.exists('file', (q) =>
                q.whereExists('ascent', (q) =>
                  q.whereExists('author', (q) => q.where('authUserFk', '=', authData.sub ?? '')),
                ),
              ),
          ],
          postMutation: [
            ...regionMembersWithRoleCan(REGION_PERMISSION_ADMIN),
            (authData, eb) =>
              eb.exists('file', (q) =>
                q.whereExists('ascent', (q) =>
                  q.whereExists('author', (q) => q.where('authUserFk', '=', authData.sub ?? '')),
                ),
              ),
          ],
        },
      },
    },
    files: {
      row: {
        select: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        delete: [
          ...regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
          (authData, eb) =>
            eb.exists('ascent', (q) => q.whereExists('author', (q) => q.where('authUserFk', '=', authData.sub ?? ''))),
        ],
        insert: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        update: {
          preMutation: [
            ...regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
            (authData, eb) =>
              eb.exists('ascent', (q) =>
                q.whereExists('author', (q) => q.where('authUserFk', '=', authData.sub ?? '')),
              ),
          ],
          postMutation: [
            ...regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
            (authData, eb) =>
              eb.exists('ascent', (q) =>
                q.whereExists('author', (q) => q.where('authUserFk', '=', authData.sub ?? '')),
              ),
          ],
        },
      },
    },
    firstAscensionists: {
      row: {
        select: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        delete: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        insert: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        update: {
          preMutation: regionMembersWithRoleCan(REGION_PERMISSION_READ),
          postMutation: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        },
      },
    },
    geolocations: {
      row: {
        select: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        delete: regionMembersWithRoleCan(REGION_PERMISSION_DELETE),
        insert: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        update: {
          preMutation: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
          postMutation: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
        },
      },
    },
    routes: {
      row: {
        select: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        delete: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
        insert: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
        update: {
          preMutation: regionMembersWithRoleCan(REGION_PERMISSION_READ),
          postMutation: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        },
      },
    },
    routeExternalResources: {
      row: {
        select: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        delete: regionMembersWithRoleCan(REGION_PERMISSION_DELETE),
        insert: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
        update: {
          preMutation: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
          postMutation: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
        },
      },
    },
    routeExternalResource27crags: {
      row: {
        select: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        delete: regionMembersWithRoleCan(REGION_PERMISSION_DELETE),
        insert: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
        update: {
          preMutation: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
          postMutation: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
        },
      },
    },
    routeExternalResource8a: {
      row: {
        select: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        delete: regionMembersWithRoleCan(REGION_PERMISSION_DELETE),
        insert: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
        update: {
          preMutation: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
          postMutation: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
        },
      },
    },
    routeExternalResourceTheCrag: {
      row: {
        select: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        delete: regionMembersWithRoleCan(REGION_PERMISSION_DELETE),
        insert: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
        update: {
          preMutation: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
          postMutation: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
        },
      },
    },
    routesToFirstAscensionists: {
      row: {
        select: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        delete: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        insert: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        update: {
          preMutation: regionMembersWithRoleCan(REGION_PERMISSION_READ),
          postMutation: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        },
      },
    },
    routesToTags: {
      row: {
        select: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        delete: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
        insert: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
        update: {
          preMutation: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
          postMutation: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
        },
      },
    },
    topos: {
      row: {
        select: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        delete: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
        insert: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
        update: {
          preMutation: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
          postMutation: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
        },
      },
    },
    topoRoutes: {
      row: {
        select: regionMembersWithRoleCan(REGION_PERMISSION_READ),
        delete: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
        insert: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
        update: {
          preMutation: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
          postMutation: regionMembersWithRoleCan(REGION_PERMISSION_EDIT),
        },
      },
    },
  } satisfies PermissionsConfig<SupabaseToken, Schema>
})
