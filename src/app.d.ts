import type { AppPermission, RegionPermission } from '$lib/auth'
import type { Grade, Region, RegionMember, UserSettings } from '$lib/db/schema'
import type { InferResultType } from '$lib/db/types'
import type { createMutators, Schema } from '$lib/db/zero'
import type { CustomMutatorDefs } from '@rocicorp/zero'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { Z } from 'zero-svelte'

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
// and what to do when importing types
declare global {
  namespace App {
    type Permission = RegionPermission | AppPermission
    interface UserRegion {
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
      userRegions: UserRegion[]
      userRole: string | undefined
    }

    // interface Error {}
    interface Locals extends SafeSession {
      safeGetSession: () => Promise<SafeSession>
      supabase: SupabaseClient
    }
    interface PageData extends Omit<Locals, 'safeGetSession' | 'supabase'> {
      grades: Grade[]
      gradingScale: NonNullable<UserSettings['gradingScale']>
      supabase?: Locals['supabase']
      z: Z<Schema, ReturnType<typeof createMutators>>
    }
    interface PageState {
      blocksViewMode?: 'list' | 'grid'
    }
    // interface Platform {}
  }
}

export {}
