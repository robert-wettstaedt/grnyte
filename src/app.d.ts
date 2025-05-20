import type {
  DELETE_PERMISSION,
  EDIT_PERMISSION,
  EXPORT_PERMISSION,
  READ_PERMISSION,
  REGION_ADMIN_PERMISSION,
  TAG_ADMIN_PERMISSION,
  USER_ADMIN_PERMISSION,
} from '$lib/auth'
import type { Grade, RegionMember, UserSettings } from '$lib/db/schema'
import type { InferResultType } from '$lib/db/types'
import type { Session, SupabaseClient } from '@supabase/supabase-js'

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
// and what to do when importing types
declare global {
  namespace App {
    type Permission =
      | typeof READ_PERMISSION
      | typeof EDIT_PERMISSION
      | typeof DELETE_PERMISSION
      | typeof EXPORT_PERMISSION
      | typeof REGION_ADMIN_PERMISSION
      | typeof TAG_ADMIN_PERMISSION
      | typeof USER_ADMIN_PERMISSION

    interface SafeSession {
      session: Session | undefined
      user:
        | InferResultType<
            'users',
            {
              userSettings: {
                columns: {
                  gradingScale: true
                  notifyModerations: true
                  notifyNewAscents: true
                  notifyNewUsers: true
                }
              }
            }
          >
        | undefined
      userPermissions: Permission[] | undefined
      userRegions: {
        regionFk: RegionMember['regionFk']
        role: RegionMember['role']
        permissions: RegionPermission[]
      }[]
      userRole: string | undefined
    }

    // interface Error {}
    interface Locals extends SafeSession {
      safeGetSession: () => Promise<SafeSession>
      supabase: SupabaseClient
    }
    interface PageData extends Omit<Locals, 'safeGetSession' | 'supabase'> {
      blockHistoryHash: string | undefined
      grades: Grade[]
      gradingScale: NonNullable<UserSettings['gradingScale']>
      supabase?: Locals['supabase']
    }
    interface PageState {
      blocksViewMode?: 'list' | 'grid'
    }
    // interface Platform {}
  }
}

export {}
