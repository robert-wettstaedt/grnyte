import type { EDIT_PERMISSION, READ_PERMISSION } from '$lib/auth'
import type { Grade, User } from '$lib/db/schema'
import type { User as AuthUser, Session, SupabaseClient } from '@supabase/supabase-js'

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
// and what to do when importing types
declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      supabase: SupabaseClient
      safeGetSession: () => Promise<{
        session: Session | null
        user: AuthUser | null
        userPermissions:
          | Array<typeof READ_PERMISSION | typeof EDIT_PERMISSION | typeof DELETE_PERMISSION | typeof EXPORT_PERMISSION>
          | undefined
        userRole: string | undefined
      }>
      session: Session | null
      user: AuthUser | null
      userPermissions:
        | Array<typeof READ_PERMISSION | typeof EDIT_PERMISSION | typeof DELETE_PERMISSION | typeof EXPORT_PERMISSION>
        | undefined
      userRole: string | undefined
    }
    interface PageData {
      authUser: AuthUser | null
      grades: Grade[]
      gradingScale: 'FB' | 'V'
      session: Session | null
      user: User
      userPermissions: Array<typeof READ_PERMISSION | typeof EDIT_PERMISSION | typeof DELETE_PERMISSION> | undefined
      userRole: string | undefined
    }
    // interface PageState {}
    // interface Platform {}
  }
}

export {}
