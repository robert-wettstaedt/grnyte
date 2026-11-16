import { PUBLIC_ORIGIN } from '$env/static/public'

/** The native app's bundle ID: the audience of its Apple ID tokens, its client ID at Apple's token endpoint. */
export const APP_BUNDLE_ID = 'rocks.grnyte'
/** Android's return: the private-use scheme. */
export const APP_SCHEME_RETURN = 'rocks.grnyte:/auth'
/** Where an iOS sign-in started by the native app returns; a permanent URL, installed apps return to it. */
export const APP_RETURN_PATH = '/app-return'

/** The only return channels a handoff may name, and where each lands (design decision 4). */
export const APP_RETURNS = {
  android: APP_SCHEME_RETURN,
  ios: `${new URL(PUBLIC_ORIGIN).origin}${APP_RETURN_PATH}`,
} as const
