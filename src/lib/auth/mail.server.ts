import type { AuthServer } from '$lib/auth/authServer.server'

type Supabase = App.Locals['supabase']

export const mailPasswordReset = (supabase: Supabase, email: string, origin: string) =>
  supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/reset-password` })

export const mailSignupConfirmation = (authServer: AuthServer, email: string) =>
  authServer.resend({ email, type: 'signup' })
