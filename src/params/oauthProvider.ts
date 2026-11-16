import { IDENTITY_TARGETS, type OAuthProvider } from '$lib/auth'

export const match = (param: string): param is OAuthProvider => (IDENTITY_TARGETS as readonly string[]).includes(param)
