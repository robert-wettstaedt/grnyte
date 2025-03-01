import type { DELETE_PERMISSION, EDIT_PERMISSION, EXPORT_PERMISSION, READ_PERMISSION } from '$lib/auth'
import type { Grade, UserSettings } from '$lib/db/schema'
import type { InferResultType, NestedBlock } from '$lib/db/types'
import type { Session, SupabaseClient } from '@supabase/supabase-js'

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
// and what to do when importing types
declare global {
  namespace App {
    interface SafeSession {
      session: Session | undefined
      user: InferResultType<'users', { userSettings: { columns: { gradingScale: true } } }> | undefined
      userPermissions:
        | Array<typeof READ_PERMISSION | typeof EDIT_PERMISSION | typeof DELETE_PERMISSION | typeof EXPORT_PERMISSION>
        | undefined
      userRole: string | undefined
    }

    // interface Error {}
    interface Locals extends SafeSession {
      safeGetSession: () => Promise<SafeSession>
      supabase: SupabaseClient
    }
    interface PageData extends Omit<Locals, 'safeGetSession' | 'supabase'> {
      blocks: NestedBlock[]
      grades: Grade[]
      gradingScale: NonNullable<UserSettings['gradingScale']>
      supabase?: Locals['supabase']
    }
    // interface PageState {}
    // interface Platform {}
  }
}

export {}
