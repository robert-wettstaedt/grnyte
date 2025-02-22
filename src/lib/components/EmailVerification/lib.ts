import { READ_PERMISSION } from '$lib/auth'
import type { Session, User } from '@supabase/supabase-js'

interface VerifiedSession extends NonNullable<Omit<Session, 'user'>> {
  user: VerifiedUser
}

interface VerifiedUser extends Omit<User, 'email'> {
  email: string
}

export const userNeedsEmailVerification = (
  session: Session | null,
  userPermissions: App.Locals['userPermissions'],
): session is VerifiedSession => {
  return (
    (userPermissions ?? [])?.includes(READ_PERMISSION) &&
    session?.user.email != null &&
    session.user.app_metadata.provider === 'email' &&
    session.user.user_metadata.email_verified === false
  )
}
