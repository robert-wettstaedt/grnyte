import type { AppPermission, RegionPermission } from '$lib/auth'
import type { InferResultType } from '$lib/db/types'
import type { UserRegion } from '$lib/entities/region/dto'
import type { Session, SupabaseClient } from '@supabase/supabase-js'

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
// and what to do when importing types
declare global {
  namespace App {
    type Permission = RegionPermission | AppPermission

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
    interface PageData {
      // All optional: these come from the root layout load, so page-level loads
      // (which contribute their own keys) needn't provide them.
      authUserId?: string | undefined
      session?: Session | undefined | null
      supabase?: Locals['supabase']
    }
    interface PageState {
      blocksViewMode?: 'list' | 'grid'
    }
    // interface Platform {}
  }

  interface Window {
    // Applies the persisted theme (class + theme-color meta). Defined by the inline
    // bootstrap in src/app.html so it runs before first paint; called by LightSwitch on change.
    __applyTheme?: () => void
  }
}

export {}
