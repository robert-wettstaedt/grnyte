import { goto } from '$app/navigation'
import { convertException } from '$lib/errors'
import type { RemoteQuery, RemoteQueryOverride, RemoteQueryUpdate } from '@sveltejs/kit'

export interface EnhanceState {
  error?: string
  loading?: boolean
  progress?: number
  additionalFields?: Partial<Record<'folderName' | 'bunnyVideoIds', string>>
}

export async function enhance(callback: () => Promise<unknown>, state?: EnhanceState) {
  try {
    state != null && (state.loading = true)
    state != null && (state.error = undefined)
    formState.error = undefined

    const returnValue = await callback()

    if (typeof returnValue === 'string') {
      goto(returnValue)
    }
  } catch (exception) {
    const error = convertException(exception)
    state != null && (state.error = error)
    formState.error = error
    document.scrollingElement?.scrollTo({ behavior: 'smooth', top: 0, left: 0 })
  }

  state != null && (state.loading = false)
}

export function enhanceForm(state?: EnhanceState) {
  return async function ({
    submit,
  }: {
    submit: () => Promise<boolean> & {
      updates: (...updates: RemoteQueryUpdate[]) => Promise<boolean>
    }
  }) {
    await enhance(submit, state)
  }
}

export const formState = $state<{ error?: string }>({})
