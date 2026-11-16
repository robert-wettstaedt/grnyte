import type { RemoteFormIssue } from '@sveltejs/kit'
import { tick } from 'svelte'
import { createAttachmentKey } from 'svelte/attachments'
import { vi } from 'vitest'

// eslint-disable-next-line svelte/prefer-svelte-reactivity -- replaced whole, never mutated, as Kit's is
export const at = $state({ data: {} as Record<string, unknown>, url: new URL('http://localhost/') })

/**
 * A remote form as the pages read it. Like Kit's, its issues stay until the form element's `reset` event, and a
 * tick after that event it re-reads its values from the emptied form (`handle_reset` in Kit's form.svelte.js).
 */
export function fakeRemoteForm() {
  const state = $state({ issues: [] as RemoteFormIssue[], values: {} as Record<string, unknown> })
  const field = { as: (type: string) => ({ name: 'field', type }), issues: () => undefined }
  const set = vi.fn((values: Record<string, unknown>) => (state.values = values))
  const fields = new Proxy({ allIssues: () => state.issues, set } as Record<string, unknown>, {
    get: (target, key: string) => target[key] ?? field,
  })
  const attributes = () => ({
    action: '',
    [createAttachmentKey()]: (node: HTMLFormElement) => {
      const clear = () =>
        void tick().then(() => {
          state.issues = []
          state.values = {}
        })
      node.addEventListener('reset', clear)
      return () => node.removeEventListener('reset', clear)
    },
    method: 'POST',
  })
  // Only `action`, `method` and the attachment enumerable: `<form {...signUp}>` spreads the rest away, as Kit's does.
  return Object.defineProperties(attributes(), {
    enhance: { value: () => attributes() },
    fail: { value: (message: string) => (state.issues = [{ message, path: [] } as unknown as RemoteFormIssue]) },
    fields: { value: fields },
    pending: { value: 0 },
    result: { value: undefined },
    set: { value: set },
    values: { get: () => state.values },
  }) as ReturnType<typeof attributes> & {
    enhance: () => ReturnType<typeof attributes>
    fail: (message: string) => void
    fields: Record<string, unknown>
    set: typeof set
    readonly values: Record<string, unknown>
  }
}
