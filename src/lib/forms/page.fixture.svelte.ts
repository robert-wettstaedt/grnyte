/** Reactive stand-ins for a screen test: `$app/state`'s `page` and a Kit remote form. */
import type { RemoteFormIssue } from '@sveltejs/kit'
import { createAttachmentKey } from 'svelte/attachments'
import { vi } from 'vitest'

/** For `vi.mock('$app/state', ...)`: assigning `url` moves the screen as a navigation would. */
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- replaced whole, never mutated, as Kit's is
export const at = $state({ data: {} as Record<string, unknown>, url: new URL('http://localhost/') })

/** A remote form as the pages read it. Like Kit's, its issues stay until the form element's `reset` event. */
export function fakeRemoteForm() {
  const state = $state({ issues: [] as RemoteFormIssue[] })
  const field = { as: (type: string) => ({ name: 'field', type }), issues: () => undefined }
  const set = vi.fn()
  const fields = new Proxy({ allIssues: () => state.issues, set } as Record<string, unknown>, {
    get: (target, key: string) => target[key] ?? field,
  })
  const attributes = () => ({
    action: '',
    [createAttachmentKey()]: (node: HTMLFormElement) => {
      const clear = () => (state.issues = [])
      node.addEventListener('reset', clear)
      return () => node.removeEventListener('reset', clear)
    },
    method: 'POST',
  })
  // Only `action`, `method` and the attachment enumerable: `<form {...signUp}>` spreads the rest away, as Kit's does.
  return Object.defineProperties(attributes(), {
    enhance: { value: () => attributes() },
    /** Test handle: a failed submit's form-level message. */
    fail: { value: (message: string) => (state.issues = [{ message, path: [] } as unknown as RemoteFormIssue]) },
    fields: { value: fields },
    pending: { value: 0 },
    result: { value: undefined },
    set: { value: set },
  }) as ReturnType<typeof attributes> & {
    enhance: () => ReturnType<typeof attributes>
    fail: (message: string) => void
    fields: Record<string, unknown>
    set: typeof set
  }
}
