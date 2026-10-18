import { afterEach, describe, expect, it, vi } from 'vitest'
import { write } from './write'

let online = true
let answer: unknown
const mutate = vi.fn(() => ({ server: Promise.resolve(answer) }))

vi.mock('$lib/state/online.svelte', () => ({ isOnline: () => online }))
vi.mock('./z.svelte', () => ({ getZ: () => ({ mutate }) }))

const mutation = {} as never
const offline = JSON.stringify({ message: 'error_offline_title' })
const nameExists = JSON.stringify({ message: 'routes_nameExists' })

afterEach(() => {
  online = true
  mutate.mockClear()
})

describe('write', () => {
  it('answers the server data, and the destination the caller named', async () => {
    answer = { data: { id: 7 }, type: 'success' }

    expect(await write(mutation, { redirectTo: '/routes/7' })).toEqual({ data: { id: 7 }, redirectTo: '/routes/7' })
  })

  it('throws our message and its field on a refusal', async () => {
    answer = { error: { details: { field: 'name' }, message: nameExists, type: 'app' }, type: 'error' }

    await expect(write(mutation)).rejects.toEqual({ body: { field: 'name', message: nameExists } })
  })

  it('throws the generic message for an app error we did not write', async () => {
    answer = {
      error: { details: undefined, message: "'ownKeys' on proxy: trap returned extra keys", type: 'app' },
      type: 'error',
    }

    await expect(write(mutation)).rejects.toEqual({
      body: { field: undefined, message: JSON.stringify({ message: 'error_server_title' }) },
    })
  })

  it('throws the offline message for a zero error, never its text', async () => {
    answer = { error: { message: 'socket closed at row 12', type: 'zero' }, type: 'error' }

    await expect(write(mutation)).rejects.toEqual({ body: { field: undefined, message: offline }, offline: true })
  })

  it('refuses before applying anything while offline', async () => {
    online = false

    await expect(write(mutation)).rejects.toEqual({ body: { field: undefined, message: offline }, offline: true })
    expect(mutate).not.toHaveBeenCalled()
  })
})
