import { convertException } from '$lib/errors'
import type { RemoteQuery, RemoteQueryOverride } from '@sveltejs/kit'

export async function enhance({
  submit,
}: {
  submit: () => Promise<void> & {
    updates: (...queries: Array<RemoteQuery<any> | RemoteQueryOverride>) => Promise<void>
  }
}) {
  try {
    await submit()
  } catch (exception) {
    formState.error = convertException(exception)
  }
}

export const formState = $state<{ error?: string }>({})
