import { goto } from '$app/navigation'
import { convertException } from '$lib/errors'
import type { RemoteQuery, RemoteQueryOverride } from '@sveltejs/kit'

export interface EnhanceState {
  loading: boolean
  error?: string
}

export async function enhance(state: EnhanceState, callback: () => Promise<unknown>) {
  try {
    state.loading = true
    state.error = undefined
    formState.error = undefined

    const returnValue = await callback()

    if (typeof returnValue === 'string') {
      goto(returnValue)
    }
  } catch (exception) {
    const error = convertException(exception)
    state.error = error
    formState.error = error
  }

  state.loading = false
}

export function enhanceForm(state: EnhanceState) {
  return async function ({
    submit,
  }: {
    submit: () => Promise<void> & {
      updates: (...queries: Array<RemoteQuery<any> | RemoteQueryOverride>) => Promise<void>
    }
  }) {
    enhance(state, submit)
  }
}

export const formState = $state<{ error?: string }>({})
