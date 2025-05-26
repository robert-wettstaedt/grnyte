import type { AppPermission, RegionPermission } from '$lib/auth'
import type { Grade, Region, RegionMember, UserSettings } from '$lib/db/schema'
import type { InferResultType } from '$lib/db/types'
import type { Session, SupabaseClient } from '@supabase/supabase-js'

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
// and what to do when importing types
declare global {
  namespace App {
    type Permission = RegionPermission | AppPermission
    type UserRegions = {
      name: string
      permissions: Permission[]
      regionFk: RegionMember['regionFk']
      role: RegionMember['role']
      settings: Region['settings']
    }

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
      userRegions: UserRegions[]
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
