import { dev } from '$app/environment'
import { page } from '$app/state'
import type { Grade } from '$lib/entities/grade/dto'
import { gradeList } from '$lib/entities/grade/resources.svelte'
import { unreadNotificationList } from '$lib/entities/notification/resources.svelte'
import type { RegionMembership, UserRegion } from '$lib/entities/region/dto'
import { userRegionList } from '$lib/entities/region/resources.svelte'
import type { AppRole, Permission, RolePermission } from '$lib/entities/rolePermission/dto'
import { rolePermissionList } from '$lib/entities/rolePermission/resources.svelte'
import type { GradingScale, User } from '$lib/entities/user/dto'
import { currentUser, currentUserRole } from '$lib/entities/user/resources.svelte'
import { isOnline } from '$lib/state/online.svelte'
import { lastSyncedAt } from '$lib/state/sync.svelte'
import type { QueryResource } from '$lib/zero/resource.svelte'
import { getContext, setContext } from 'svelte'

const GLOBAL_STATE_KEY = Symbol('global-state')

/**
 * App-wide reference data and the signed-in user, loaded once from Zero and
 * shared through Svelte context. The underlying queries are eagerly preloaded
 * in `initZero`, so reads here render from the local store immediately.
 */
export interface GlobalState {
  /** All grades, ordered by their ordinal id (low → high). */
  readonly grades: Grade[]
  /** Raw resources, for loading/empty/error states. */
  readonly gradesResource: QueryResource<Grade[]>
  /** The user's preferred grading scale; defaults to `FB` until settings load. */
  readonly gradingScale: GradingScale
  /** True while app-shell prerequisites are still loading. */
  readonly isLoading: boolean
  /**
   * Offline, with nothing usable synced. The app cannot render past the shell and no request can
   * fix it, so the layout shows a dedicated screen rather than an endless spinner.
   */
  readonly isStoreCold: boolean
  /** When this device last completed a sync, or null if it never has. Per device, not per account. */
  readonly lastSyncedAt: null | number
  readonly rolePermissionsResource: QueryResource<RolePermission[]>
  /**
   * Unread directed notifications, capped at `UNREAD_CAP + 1`.
   *
   * App-wide because three surfaces read the same number and must never disagree: the bell in
   * the feed header, the dot on the feed tab, and the OS badge. It counts only what was aimed at
   * this person, never region activity, which is the whole reason the inbox and the feed are two
   * different things.
   */
  readonly unreadNotifications: number
  /** The signed-in user with their settings, or `undefined` while loading. */
  readonly user: undefined | User

  /** Permissions granted by the user's role, or `undefined` if they have no role. */
  readonly userPermissions: Permission[] | undefined
  /** The user's active region memberships, each with the permissions its role grants. */
  readonly userRegions: UserRegion[]
  readonly userRegionsResource: QueryResource<RegionMembership[]>
  readonly userResource: QueryResource<undefined | User>
  /** The user's app/region role, or `undefined` if they have none. */
  readonly userRole: AppRole | undefined
  readonly userRoleResource: QueryResource<AppRole | undefined>
}

/** Reads the global state published by {@link setGlobalState}. */
export function getGlobalState(): GlobalState {
  const state = getContext<GlobalState | undefined>(GLOBAL_STATE_KEY)
  if (state == null) {
    throw new Error('Global state is not available — setGlobalState() must run in the (app) layout first')
  }
  return state
}

/**
 * Publishes an already-built state object on context. `setGlobalState` builds
 * the real one from Zero resources; Storybook's preview decorator and the
 * server-loaded `/f/<id>` share page inject a static fixture through here instead.
 */
export function provideGlobalState(state: GlobalState): GlobalState {
  setContext(GLOBAL_STATE_KEY, state)
  return state
}

/**
 * Instantiates the global resources and publishes them on context. Call once,
 * during init of the authenticated `(app)` layout. Resources read `getZ()`
 * reactively, so they re-target automatically when the Zero client swaps.
 */
export function setGlobalState(): GlobalState | undefined {
  if (page.data.session?.user == null) {
    return
  }

  const gradesResource = gradeList()
  const userResource = currentUser()
  const userRoleResource = currentUserRole()
  const rolePermissionsResource = rolePermissionList()
  const userRegionsResource = userRegionList()
  // Not part of `isLoading`: the shell must not wait on the inbox to render, and an unread count
  // that starts at zero and moves is exactly right.
  const unreadResource = unreadNotificationList()

  const state: GlobalState = {
    get grades() {
      return gradesResource.data
    },
    get gradesResource() {
      return gradesResource
    },
    get gradingScale() {
      return userResource.data?.userSettings?.gradingScale ?? 'FB'
    },
    get isLoading() {
      return (
        gradesResource.status === 'loading' ||
        userResource.status === 'loading' ||
        userRoleResource.status === 'loading' ||
        rolePermissionsResource.status === 'loading' ||
        userRegionsResource.status === 'loading'
      )
    },
    get isStoreCold() {
      // Offline with nothing usable in the local store. `isLoading` cannot tell this apart from a
      // slow first sync on its own: an unknown-and-empty result is reported as `loading` and stays
      // there for as long as the server is unreachable, so without this branch the app sits on a
      // full-screen spinner forever with no way out and no status bar to explain it.
      //
      // Deliberately not gated on `lastSyncedAt`: a first-ever visit made offline is stuck in
      // exactly the same way and deserves the same escape. The stamp only decides the wording,
      // "reconnect to restore" against "connect to get started", which the layout reads separately.
      return !isOnline() && this.isLoading
    },
    get lastSyncedAt() {
      return lastSyncedAt()
    },
    get rolePermissionsResource() {
      return rolePermissionsResource
    },
    get unreadNotifications() {
      return unreadResource.data.length
    },
    get user() {
      return userResource.data
    },
    get userPermissions() {
      const role = userRoleResource.data
      if (role == null) {
        return undefined
      }

      return rolePermissionsResource.data
        .filter((rolePermission) => rolePermission.role === role)
        .map((rolePermission) => rolePermission.permission)
    },
    get userRegions() {
      const rolePermissions = rolePermissionsResource.data

      return userRegionsResource.data.map((membership) => ({
        ...membership,
        permissions: rolePermissions
          .filter((rolePermission) => rolePermission.role === membership.role)
          .map((rolePermission) => rolePermission.permission),
      }))
    },
    get userRegionsResource() {
      return userRegionsResource
    },
    get userResource() {
      return userResource
    },
    get userRole() {
      return userRoleResource.data
    },
    get userRoleResource() {
      return userRoleResource
    },
  }

  if (dev) {
    // The five resources `isLoading` is made of, readable from the console. A full-screen spinner
    // says only "one of them is loading"; this says which, and whether the local store or the
    // server confirmation is the part that is missing.
    Object.assign(window, {
      __grnyteGlobal: {
        get statuses() {
          return {
            grades: describe(gradesResource),
            rolePermissions: describe(rolePermissionsResource),
            user: describe(userResource),
            userRegions: describe(userRegionsResource),
            userRole: describe(userRoleResource),
          }
        },
      },
    })
  }

  return provideGlobalState(state)
}

/**
 * A static, already-"ready" {@link GlobalState} for contexts without Zero: Storybook
 * fixtures and the standalone `/f/<id>` page (which loads its reference data over a
 * server load). Only the fields a caller needs must be passed; the rest default to empty.
 */
export function staticGlobalState(
  data: {
    grades?: Grade[]
    gradingScale?: GradingScale
    user?: User
    userPermissions?: Permission[]
    userRegions?: UserRegion[]
    userRole?: AppRole
  } = {},
): GlobalState {
  const ready = <T>(value: T): QueryResource<T> => ({
    // The data is already in hand, so this is an answer by construction: never loading, and never
    // an offline state, whatever the connection is doing around it.
    availability: 'ready',
    data: value,
    isComplete: true,
    isEmpty: Array.isArray(value) ? value.length === 0 : value == null,
    isSyncing: false,
    status: 'ready',
  })

  const grades = data.grades ?? []
  const userRegions = data.userRegions ?? []

  return {
    grades,
    gradesResource: ready(grades),
    gradingScale: data.gradingScale ?? data.user?.userSettings?.gradingScale ?? 'FB',
    isLoading: false,
    // The static fixture is server-rendered or a Storybook decorator: its data is already in hand,
    // so it is never cold and has nothing to say about this device's sync history.
    isStoreCold: false,
    lastSyncedAt: null,
    rolePermissionsResource: ready([]),
    unreadNotifications: 0,
    user: data.user,
    userPermissions: data.userPermissions,
    userRegions,
    userRegionsResource: ready(userRegions),
    userResource: ready(data.user),
    userRole: data.userRole,
    userRoleResource: ready(data.userRole),
  }
}

/** One resource's state, for the dev console hook above. */
function describe(resource: QueryResource<unknown>) {
  return { isComplete: resource.isComplete, isEmpty: resource.isEmpty, status: resource.status }
}
