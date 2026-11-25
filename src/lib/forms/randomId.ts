/**
 * A random id with no server round trip. `crypto.randomUUID` is missing on an insecure origin (the app on a
 * phone over http), where `getRandomValues` is not.
 */
export const randomId = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('')
