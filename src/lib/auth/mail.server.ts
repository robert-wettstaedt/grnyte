type Supabase = App.Locals['supabase']

export const mailPasswordReset = (supabase: Supabase, email: string, origin: string) =>
  supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/reset-password` })

export const mailSignupConfirmation = (supabase: Supabase, email: string) =>
  supabase.auth.resend({ email, type: 'signup' })
