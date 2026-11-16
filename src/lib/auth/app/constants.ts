import { PUBLIC_ORIGIN } from '$env/static/public'

export const APP_BUNDLE_ID = 'rocks.grnyte'
export const APP_SCHEME_RETURN = 'rocks.grnyte:/auth'
/** Where an iOS sign-in started by the native app returns; a permanent URL, installed apps return to it. */
export const APP_RETURN_PATH = '/app-return'
/** The content paths a link may open in the native app, in both link files and Android's intent filters. */
export const APP_LINK_PREFIXES = ['/areas', '/blocks', '/routes', '/feed', '/users'] as const

/** The only return channels a handoff may name, and where each lands. */
export const APP_RETURNS = {
  android: APP_SCHEME_RETURN,
  ios: `${new URL(PUBLIC_ORIGIN).origin}${APP_RETURN_PATH}`,
} as const
