/**
 * The upload status machine: abort races, retry/resume, finalize idempotence and the
 * beforeunload refcount. All of it used to be reachable only by hand-driving a browser
 * on a flaky connection, which is the same as untested.
 *
 * No dependency injection was needed to get here: `ImageUpload` is exported, and the three
 * things it reaches for from module scope (`$app/state`, `$env/static/public` and its own
 * remote functions) are mocked the way `hooks.server.test.ts` already mocks module-level
 * SvelteKit deps. The transfer is an XHR, so a fake `XMLHttpRequest` gives the test the one
 * thing a browser normally owns: exactly when the bytes land, fail, or get aborted.
 */
import { m } from '$lib/paraglide/messages'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const finalizeImage = vi.fn()
const supabase = {
  auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: 'token' } } })) },
  storage: { from: vi.fn(() => ({ remove: vi.fn(() => Promise.resolve()) })) },
}
const pageData: { authUserId: string; supabase: typeof supabase | undefined } = {
  authUserId: 'auth-uid',
  supabase,
}

vi.mock('$app/state', () => ({
  page: {
    get data() {
      return pageData
    },
  },
}))
vi.mock('$env/static/public', () => ({
  PUBLIC_BUNNY_STREAM_LIBRARY_ID: '1',
  PUBLIC_SUPABASE_URL: 'https://supabase.test',
}))
vi.mock('./files.remote', () => ({
  createBunnyVideo: vi.fn(),
  finalizeImage: (...args: unknown[]) => finalizeImage(...args),
  finalizeVideo: vi.fn(),
}))

const { ImageUpload } = await import('./upload-manager.svelte')

/** The live fake XHRs, newest last: each test drives the transfer through these. */
let sent: FakeXhr[] = []

/** Enough of XMLHttpRequest for uploadToStaging: the test decides when bytes land. */
class FakeXhr {
  onabort: (() => void) | null = null
  onerror: (() => void) | null = null
  onload: (() => void) | null = null
  status = 200
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null }
  private headers: Record<string, string> = {}

  abort() {
    this.onabort?.()
  }
  /** Fail the transfer the way a dropped connection does. */
  fail() {
    this.onerror?.()
  }
  open() {}
  send() {
    sent.push(this)
  }

  setRequestHeader(key: string, value: string) {
    this.headers[key] = value
  }
  /** Land the bytes successfully. */
  succeed() {
    this.onload?.()
  }
}

const file = (name = 'photo.jpg') => new File(['bytes'], name, { type: 'image/jpeg' })
const target = { id: 1, type: 'block' } as const
const row = { id: 'file-1' }
/** Let queued promise callbacks run without advancing timers. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  sent = []
  pageData.supabase = supabase
  finalizeImage.mockReset().mockResolvedValue({ data: row })
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
  vi.stubGlobal('URL', Object.assign(globalThis.URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('transfer', () => {
  it('reports progress and lands on staged', async () => {
    const upload = new ImageUpload(file())
    upload.start()
    await flush()

    sent[0].upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 4 } as ProgressEvent)
    expect(upload.progress).toBe(0.25)
    expect(upload.status).toBe('uploading')

    sent[0].succeed()
    await flush()
    expect(upload.status).toBe('staged')
    expect(upload.progress).toBe(1)
  })

  it('does not reject unhandled when nobody awaits a failed transfer', async () => {
    // Watch for the rejection. The status/error assertions below are already made by
    // 're-runs the transfer when the bytes never landed' on this same fail() setup, so on their
    // own they left the internal `.catch(() => {})` free to be deleted, with the regression
    // riding on whether vitest happened to surface a process-level unhandled rejection.
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)

    try {
      const upload = new ImageUpload(file())
      upload.start()
      await flush()
      sent[0].fail()
      // Two macrotasks: the rejection is raised in the first, and Node reports it unhandled at
      // the end of that turn, so a single flush could pass before it was ever going to fire.
      await flush()
      await flush()

      expect(upload.status).toBe('failed')
      // The exact message, so this cannot be satisfied by any other failure path.
      expect(upload.error).toBe(m.upload_networkError())
      // The point of the internal `.catch(() => {})`: a transfer nobody awaits until submit
      // must not surface as an unhandled rejection and kill the page.
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })
})

describe('finalize', () => {
  it('is idempotent: a resubmitted form does not re-attach a done upload', async () => {
    const upload = new ImageUpload(file())
    upload.start()
    await flush()
    sent[0].succeed()

    expect(await upload.finalize(target)).toEqual(row)
    expect(await upload.finalize(target)).toEqual(row)
    expect(finalizeImage).toHaveBeenCalledTimes(1)
    expect(upload.status).toBe('done')
  })

  it('shares one attempt when submit and retry overlap', async () => {
    const upload = new ImageUpload(file())
    upload.start()
    await flush()
    sent[0].succeed()

    const [a, b] = await Promise.all([upload.finalize(target), upload.finalize(target)])
    expect(a).toEqual(b)
    expect(finalizeImage).toHaveBeenCalledTimes(1)
  })

  it('fails instead of reporting done when finalize returns no row', async () => {
    // A `done` upload with no `fileRow` used to be possible via `return this.fileRow!`,
    // and every caller immediately reads `row.id`.
    finalizeImage.mockResolvedValue({ data: undefined })
    const upload = new ImageUpload(file())
    upload.start()
    await flush()
    sent[0].succeed()

    await expect(upload.finalize(target)).rejects.toThrow()
    expect(upload.status).toBe('failed')
    expect(upload.fileRow).toBeUndefined()
  })

  it('does not attach an upload cancelled after its bytes already landed', async () => {
    const upload = new ImageUpload(file())
    upload.start()
    await flush()
    // Transfer complete: there is no longer an XHR to abort, so remove() cannot stop the
    // finalize by rejecting the staging promise. Only the explicit aborted re-check can.
    sent[0].succeed()
    await flush()
    expect(upload.status).toBe('staged')

    upload.remove()

    await expect(upload.finalize(target)).rejects.toThrow()
    expect(finalizeImage).not.toHaveBeenCalled()
  })

  it('does not attach an upload cancelled while its bytes were still transferring', async () => {
    const upload = new ImageUpload(file())
    upload.start()
    await flush()

    const pending = upload.finalize(target)
    upload.remove()

    await expect(pending).rejects.toThrow()
    expect(finalizeImage).not.toHaveBeenCalled()
  })
})

describe('retry', () => {
  it('re-runs the transfer when the bytes never landed', async () => {
    const upload = new ImageUpload(file())
    upload.start()
    await flush()
    sent[0].fail()
    await flush()
    expect(upload.status).toBe('failed')

    void upload.retry()
    await flush()
    expect(sent).toHaveLength(2)
    sent[1].succeed()
    await flush()
    expect(upload.status).toBe('staged')
  })

  it('re-finalizes without re-uploading when the bytes already landed', async () => {
    finalizeImage.mockRejectedValueOnce(new Error('boom'))
    const upload = new ImageUpload(file())
    upload.start()
    await flush()
    sent[0].succeed()
    await expect(upload.finalize(target)).rejects.toThrow('boom')

    await upload.retry()
    // One transfer, two finalize attempts: a staged upload resumes at the finalize step.
    expect(sent).toHaveLength(1)
    expect(finalizeImage).toHaveBeenCalledTimes(2)
    expect(upload.status).toBe('done')
  })

  it('is a no-op once the upload was removed', async () => {
    const upload = new ImageUpload(file())
    upload.start()
    await flush()
    upload.remove()

    await upload.retry()
    expect(sent).toHaveLength(1)
    expect(finalizeImage).not.toHaveBeenCalled()
  })
})

describe('beforeunload guard', () => {
  it('warns only while an upload is actually transferring or finalizing', async () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')

    const upload = new ImageUpload(file())
    upload.start()
    await flush()
    expect(add).toHaveBeenCalledWith('beforeunload', expect.any(Function))

    // Staged but not submitted: nothing is in flight, so closing the tab loses nothing.
    sent[0].succeed()
    await flush()
    expect(remove).toHaveBeenCalledWith('beforeunload', expect.any(Function))

    // A finalize that HANGS, so the armed state is observable. With the mock resolving instantly
    // the re-arm was never seen: `exitBusy` computes `(busy.get(upload) ?? 1) - 1`, so even with
    // no matching `enterBusy` it still reaches zero and still calls removeEventListener. Deleting
    // `enterBusy(this)` from `runFinalize`, which is closing the tab mid-finalize with no warning
    // and losing the upload, passed every assertion here.
    let release!: (value: unknown) => void
    finalizeImage.mockReturnValue(new Promise((resolve) => (release = resolve)))

    add.mockClear()
    const pending = upload.finalize(target)
    await flush()
    expect(add).toHaveBeenCalledWith('beforeunload', expect.any(Function))

    remove.mockClear()
    release({ data: row })
    await pending
    // Finalize re-armed and then released it; the refcount must land back at zero.
    expect(remove).toHaveBeenCalledWith('beforeunload', expect.any(Function))
  })
})

describe('staging preconditions', () => {
  it('fails cleanly when there is no supabase client', async () => {
    pageData.supabase = undefined
    const upload = new ImageUpload(file())
    upload.start()
    await flush()

    expect(upload.status).toBe('failed')
    expect(sent).toHaveLength(0)
  })
})
