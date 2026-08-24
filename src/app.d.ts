import type { AppPermission, RegionPermission, VerifiedClaims } from '$lib/auth'
import type { InferResultType } from '$lib/db/types'
import type { UserRegion } from '$lib/entities/region/dto'
import type { Session, SupabaseClient } from '@supabase/supabase-js'

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
// and what to do when importing types
declare global {
  namespace App {
    // interface Error {}
    interface Locals extends SafeSession {
      /**
       * The verified token claims, and the only trustworthy identity on this request.
       *
       * There is deliberately no `session` here. `@supabase/ssr` lifts `session.user` straight out
       * of an unsigned cookie, so its `id` and `email` are whatever the client wrote there, and a
       * verified token sitting beside a forged `user` object is the shape of the bug this replaced.
       */
      claims: undefined | VerifiedClaims
      safeGetSession: () => Promise<SafeSession & { claims: undefined | VerifiedClaims }>
      supabase: SupabaseClient
    }

    interface PageData {
      // All optional: these come from the root layout load, so page-level loads
      // (which contribute their own keys) needn't provide them.
      authUserId?: string | undefined
      session?: null | Session | undefined
      supabase?: Locals['supabase']
    }

    interface PageState {
      blocksViewMode?: 'grid' | 'list'
      mapView?: { center: [number, number]; zoom: number }
    }
    type Permission = AppPermission | RegionPermission
    interface SafeSession {
      user:
        | InferResultType<
            'users',
            {
              userSettings: {
                columns: {
                  gradingScale: true
                  notifyAscents: true
                  notifyCommunity: true
                  notifyDirected: true
                  notifyGuidebookEdits: true
                  unitSystem: true
                }
              }
            }
          >
        | undefined
      userPermissions: Permission[] | undefined
      userRegions: UserRegion[]
      userRole: string | undefined
    }
    // interface Platform {}
  }

  // Not in lib.dom: `beforeinstallprompt` is a Chromium extension (Chrome, Edge, Opera, Samsung),
  // never implemented in Safari or Firefox. See $lib/state/install.svelte.
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<{ outcome: 'accepted' | 'dismissed' }>
  }

  interface Window {
    // Applies the persisted theme (class + theme-color meta). Defined by the inline
    // bootstrap in src/app.html so it runs before first paint; called by ThemeSwitch on change.
    __applyTheme?: () => void
    // The stashed install prompt, caught by the inline script in src/app.html because the event
    // beats the client bundle on a server-rendered page. Read by $lib/state/install.svelte.
    __installPrompt?: BeforeInstallPromptEvent | null
  }

  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent
  }
}

export {}
