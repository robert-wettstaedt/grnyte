import { remoteResource } from '$lib/components/QueryState/remoteResource'
import { formError } from '$lib/forms/schemas'
import { createFormStore } from '$lib/forms/store.svelte'
import * as z from '$lib/forms/zod'
import type { RemoteQuery } from '@sveltejs/kit'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { wipeAndLeave } from '../pwa/wipe'
import { notifyError, toaster } from './toast'

vi.mock('../pwa/wipe', () => ({ wipeAndLeave: vi.fn(async () => {}) }))
vi.mock('../online.svelte', () => ({ isOnline: () => true }))

/** What a remote answers after `requireLiveSession` found the session revoked. */
const ended = { body: { message: formError('auth_sessionEnded') }, status: 401 }

beforeEach(() => vi.mocked(wipeAndLeave).mockClear())

describe('a refusal saying this device was signed out elsewhere', () => {
  it('leaves from a form submit without putting it on the form', async () => {
    const form = createFormStore(z.object({ email: z.string() }))
    form.fields.set({ email: 'a@b.c' })

    await form.submit(() => Promise.reject(ended))
    await vi.dynamicImportSettled()

    expect(wipeAndLeave).toHaveBeenCalledOnce()
    expect(wipeAndLeave).toHaveBeenCalledWith('/')
    expect(form.fields.allIssues() ?? []).toEqual([])
  })

  it('leaves from a one-press command without a toast', async () => {
    const create = vi.spyOn(toaster, 'create')

    notifyError(ended)
    await vi.dynamicImportSettled()

    expect(wipeAndLeave).toHaveBeenCalledOnce()
    expect(create).not.toHaveBeenCalled()
    create.mockRestore()
  })

  it('leaves once from a remote query, however often it renders, and shows no error state', async () => {
    const resource = remoteResource({ error: ended, loading: false, ready: false } as unknown as RemoteQuery<number>)

    expect(resource.phase).toEqual({ kind: 'loading' })
    expect(resource.phase).toEqual({ kind: 'loading' })
    await vi.dynamicImportSettled()
    expect(wipeAndLeave).toHaveBeenCalledOnce()
  })

  it('still shows every other refusal', async () => {
    notifyError({ body: { message: formError('auth_mailUnavailable') }, status: 400 })
    await vi.dynamicImportSettled()
    expect(wipeAndLeave).not.toHaveBeenCalled()
  })
})
