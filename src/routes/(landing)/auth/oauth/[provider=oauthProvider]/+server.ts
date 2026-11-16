import { oauthReturnTarget, REAUTH_ACTIONS, REAUTH_TARGET_MAX, type ReauthAction } from '$lib/auth'
import { startOAuth } from '$lib/auth/oauth/flow.server'
import type { OAuthProvider } from '$lib/auth/oauth/providers.server'
import { boundTarget, reauthCaller } from '$lib/auth/reauth/reauth.server'
import { error, redirect } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

/** A form POST, so Kit's origin check guards it and the buttons work without JavaScript. */
export const POST: RequestHandler = async (event) => {
  const form = await event.request.formData()
  const field = (name: string) => {
    const value = form.get(name)
    return typeof value === 'string' && value !== '' ? value : null
  }
  const provider = event.params.provider as OAuthProvider
  const next = field('next')

  if (field('intent') === 'link') {
    // Any posted return path is ignored: a link always comes back to its own settings step.
    const returnTo = `${oauthReturnTarget(null, 'link')}?step=add-${provider}`
    return startOAuth(event, provider, { caller: await reauthCaller(), kind: 'link' }, null, returnTo)
  }
  if (field('intent') === 'confirm') {
    const action = field('action') as ReauthAction
    const sent = field('target')
    if (provider !== 'apple' || !REAUTH_ACTIONS.includes(action) || sent == null || sent.length > REAUTH_TARGET_MAX)
      error(400)
    const caller = await reauthCaller()
    const intent = { action, caller, kind: 'confirm', target: boundTarget(caller, action, sent) } as const
    return startOAuth(event, provider, intent, null, oauthReturnTarget(field('returnTo'), 'confirm'))
  }
  if (field('intent') !== 'signin') redirect(303, '/auth/error?reason=failed')

  const screen = `/auth/${field('screen') ?? 'signin'}`
  const returnTo = oauthReturnTarget(next == null ? screen : `${screen}?${new URLSearchParams({ next })}`, 'signin')
  return startOAuth(event, provider, { kind: 'signin' }, next, returnTo)
}
