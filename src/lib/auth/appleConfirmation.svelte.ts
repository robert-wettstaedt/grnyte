import { remoteResource } from '$lib/components/QueryState/remoteResource'
import { signInMethodsQuery } from './identities.remote'

/**
 * Whether a re-auth screen offers "Confirm with Apple": the account has Apple and Apple is configured.
 * `settled` once the methods query answered or failed, so a broken query never holds the step.
 */
export function appleConfirmation() {
  const methods = remoteResource(signInMethodsQuery())
  return {
    get available(): boolean {
      const data = methods.data
      return data != null && data.providers.apple.linked && data.configured.includes('apple')
    },
    /** Undefined until the query answers. */
    get hasPassword(): boolean | undefined {
      return methods.data?.hasPassword
    },
    get settled(): boolean {
      const { kind } = methods.phase
      return kind === 'answered' || kind === 'error' || kind === 'unavailable'
    },
  }
}
