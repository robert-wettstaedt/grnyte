import type { OAuthProvider } from '$lib/auth/oauth/providers.server'

export const match = (param: string): param is OAuthProvider => param === 'apple' || param === 'google'
