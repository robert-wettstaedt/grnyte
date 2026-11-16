import { remoteResource } from '$lib/components/QueryState/remoteResource'
import { signInMethodsQuery } from '../methods/identities.remote'

/** The account has Apple and this origin offers it. */
export const appleOffered = (methods: { configured: string[]; providers: { apple: { linked: boolean } } }): boolean =>
  methods.providers.apple.linked && methods.configured.includes('apple')

/**
 * Whether a re-auth screen offers "Confirm with Apple": the account has Apple and Apple is configured.
 * `settled` once the methods query answered or failed, so a broken query never holds the step.
 */
export function appleConfirmation() {
  // Storybook stubs remotes with a throw: no Apple there, and nothing to wait for.
  const methods = (() => {
    try {
      return remoteResource(signInMethodsQuery())
    } catch {
      return undefined
    }
  })()
  return {
    get available(): boolean {
      const data = methods?.data
      return data != null && appleOffered(data)
    },
    get hasPassword(): boolean | undefined {
      return methods?.data?.hasPassword
    },
    get settled(): boolean {
      if (methods == null) return true
      const { kind } = methods.phase
      return kind === 'answered' || kind === 'error' || kind === 'unavailable'
    },
  }
}
