import { describe, expect, it, vi } from 'vitest'
import { submitCommand } from './command'
import { formError } from './schemas'

vi.mock('$lib/state/online.svelte', () => ({ isOnline: () => true }))

describe('submitCommand', () => {
  it('passes our own refusal through and replaces a server error text nobody wrote', async () => {
    const refused = { body: { field: 'currentPassword', message: formError('settings_passwordIncorrect') } }
    await expect(submitCommand(() => Promise.reject(refused))).rejects.toBe(refused)

    await expect(submitCommand(() => Promise.reject({ body: { message: 'Something went wrong' } }))).rejects.toEqual({
      body: { message: formError('error_server_title') },
    })
  })
})
