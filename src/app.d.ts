import type { DELETE_PERMISSION, EDIT_PERMISSION, EXPORT_PERMISSION, READ_PERMISSION } from '$lib/auth'
import type { Grade, UserSettings } from '$lib/db/schema'
import type { InferResultType, NestedBlock } from '$lib/db/types'
import type { User as AuthUser, Session, SupabaseClient } from '@supabase/supabase-js'

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
// and what to do when importing types
declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      safeGetSession: () => Promise<{
        session: Session | null
        user: AuthUser | null
        userPermissions:
          | Array<typeof READ_PERMISSION | typeof EDIT_PERMISSION | typeof DELETE_PERMISSION | typeof EXPORT_PERMISSION>
          | undefined
        userRole: string | undefined
      }>
      session: Session | null
      supabase: SupabaseClient
      user: AuthUser | null
      userPermissions:
        | Array<typeof READ_PERMISSION | typeof EDIT_PERMISSION | typeof DELETE_PERMISSION | typeof EXPORT_PERMISSION>
        | undefined
      userRole: string | undefined
    }
    interface PageData extends Omit<Locals, 'safeGetSession' | 'user' | 'supabase'> {
      authUser: Locals['user']
      blocks: NestedBlock[]
      grades: Grade[]
      gradingScale: NonNullable<UserSettings['gradingScale']>
      supabase?: Locals['supabase']
      user: InferResultType<'users', { userSettings: true }> | undefined
    }
    // interface PageState {}
    // interface Platform {}
  }
}

export {}
