/**
 * Client half of the media upload flow. Files start uploading the moment
 * they're picked — in parallel with form filling — images to the Supabase
 * staging bucket, videos directly to Bunny via TUS. After the entity is
 * created the form calls {@link finalizeMediaUploads}, which attaches each
 * upload via its finalize remote function (record-first: the entity never
 * waits for its media).
 *
 * Uploads are plain objects owned by the form; the transfer and finalize
 * promises keep running when components unmount or the route changes, so only
 * closing the tab kills them — which the beforeunload guard warns about while
 * any upload is busy.
 */
import { page } from '$app/state'
import { PUBLIC_BUNNY_STREAM_LIBRARY_ID, PUBLIC_SUPABASE_URL } from '$env/static/public'
import type { File as FileRow } from '$lib/db/schema'
import { m } from '$lib/paraglide/messages'
import { toaster } from '$lib/state/toast'
import { SvelteMap } from 'svelte/reactivity'
import { Upload as TusUpload } from 'tus-js-client'
import { createBunnyVideo, finalizeImage, finalizeVideo } from './files.remote'
import { imageMimeOf, STAGING_BUCKET, stagingPath, type FileEntityType } from './upload'

/** What a drop zone holds and a form finalizes — `kind` discriminates the two pipelines. */
export type MediaUpload = ImageUpload | VideoUpload

export type MediaUploadStatus = 'done' | 'failed' | 'finalizing' | 'staged' | 'uploading'

export interface MediaUploadTarget {
  id: number
  type: FileEntityType
}

// Warn on tab close while any upload is transferring or finalizing — a staged
// file that hasn't been submitted loses nothing, so it doesn't count as busy.
// Refcounted per upload: staging and finalizing overlap on the same object.
const busy = new SvelteMap<MediaUploadBase, number>()
const guard = (event: BeforeUnloadEvent) => event.preventDefault()
const syncGuard = () => {
  if (busy.size > 0) {
    window.addEventListener('beforeunload', guard)
  } else {
    window.removeEventListener('beforeunload', guard)
  }
}
const enterBusy = (upload: MediaUploadBase) => {
  busy.set(upload, (busy.get(upload) ?? 0) + 1)
  syncGuard()
}
const exitBusy = (upload: MediaUploadBase) => {
  const count = (busy.get(upload) ?? 1) - 1
  if (count <= 0) {
    busy.delete(upload)
  } else {
    busy.set(upload, count)
  }
  syncGuard()
}

/** An upload finalizing in the background, tagged with where it's headed. */
export interface PendingUpload {
  target: MediaUploadTarget
  upload: MediaUpload
}

/**
 * The status machine both pipelines share. Subclasses own the transfer
 * (staging XHR / Bunny TUS) and provide {@link attach} — the finalize remote
 * call that runs once the bytes have landed.
 */
abstract class MediaUploadBase {
  /** Set by {@link remove}: the user cancelled. A deliberate abort is not a failure, so
   *  the finalize toast and {@link retry} skip it (its `status` still lands on `failed`
   *  from the aborted transfer, but the owner has already dropped it). */
  aborted = false
  error = $state<string>()

  readonly file: File
  /** The created `files` row once finalized. */
  fileRow = $state.raw<FileRow>()
  /** Object URL for the local preview; revoked once the upload leaves the UI. */
  readonly previewUrl: string
  /** Bytes transferred, 0..1. */
  progress = $state(0)

  status = $state<MediaUploadStatus>('uploading')

  /** Whether the bytes have fully landed at their destination. */
  protected isStaged = false
  /** Resolves when the transfer completes; rejects on failure. Recreated by each attempt. */
  protected stagedPromise: Promise<void> = Promise.resolve()
  protected target: MediaUploadTarget | undefined
  /** In-flight finalize, shared so overlapping submit/retry await one attempt instead of double-attaching. */
  private finalizePromise: Promise<FileRow> | undefined

  constructor(file: File) {
    this.file = file
    this.previewUrl = URL.createObjectURL(file)
  }

  /**
   * Attach the upload to its entity: wait for the transfer to complete, then
   * run the finalize remote function. Throws on failure, leaving the upload in
   * `failed` with the target retained so {@link retry} can resume.
   */
  async finalize(target: MediaUploadTarget): Promise<FileRow> {
    // Idempotent: a resubmitted form re-finalizes every upload — an attached
    // one just returns its row (re-running the remote function would fail and
    // flip a done upload to failed).
    if (this.fileRow != null) {
      return this.fileRow
    }
    return (this.finalizePromise ??= this.runFinalize(target).finally(() => (this.finalizePromise = undefined)))
  }
  /** Abort the transfer and drop whatever landed. The owner drops the reference. */
  abstract remove(): void
  /** Resume after a failure: re-run the transfer if it didn't finish, re-finalize if a target is set. */
  async retry(): Promise<void> {
    // An aborted upload is gone (reference dropped, preview revoked), nothing to resume.
    if (this.aborted) {
      return
    }
    if (!this.isStaged) {
      this.start()
    } else {
      this.error = undefined
    }
    if (this.target != null) {
      await this.finalize(this.target)
    }
  }

  /** Kick off (or resume) the transfer. Does not throw — failure lands in `status`/`error`. */
  abstract start(): void

  /** The finalize remote call — runs once the transfer has completed. */
  protected abstract attach(target: MediaUploadTarget): Promise<FileRow | undefined>

  private async runFinalize(target: MediaUploadTarget): Promise<FileRow> {
    this.target = target
    enterBusy(this)
    try {
      await this.stagedPromise
      // remove() may have landed while the bytes were still transferring (it can't
      // abort a transfer that already finished), so bail before attaching a row the
      // user cancelled. The preview blob is revoked, so its tile is already gone.
      if (this.aborted) {
        throw new Error(m.upload_failed())
      }
      this.status = 'finalizing'
      // `attach` is typed optional because a remote function's result is; a finalize that
      // resolves without a row is a failure, not a done upload. Checked rather than
      // asserted with `!`, or callers get `status: 'done'` and a TypeError on `row.id`.
      const row = await this.attach(target)
      if (row == null) {
        throw new Error(m.upload_failed())
      }
      this.fileRow = row
      this.status = 'done'
      // The preview blob stays alive until the synced `files` row takes over the tile
      // (dropPending revokes it then), so the media never blinks out mid-handoff.
      return row
    } catch (error) {
      this.status = 'failed'
      this.error ??= error instanceof Error ? error.message : m.upload_failed()
      throw error
    } finally {
      exitBusy(this)
    }
  }
}

export class ImageUpload extends MediaUploadBase {
  readonly kind = 'image' as const
  /** Path in the staging bucket — stable for the upload's lifetime, usable as a list key. */
  readonly path: string

  private xhr: undefined | XMLHttpRequest

  constructor(file: File) {
    super(file)
    this.path = stagingPath(page.data.authUserId ?? '', file.name)
  }

  /** Abort the transfer and delete the staged object. */
  remove(): void {
    this.aborted = true
    this.xhr?.abort()
    if (this.isStaged) {
      // Fire-and-forget — a leftover object is the cleanup cron's job.
      void page.data.supabase?.storage.from(STAGING_BUCKET).remove([this.path])
    }
    URL.revokeObjectURL(this.previewUrl)
  }

  start(): void {
    this.status = 'uploading'
    this.progress = 0
    this.error = undefined
    this.stagedPromise = this.uploadToStaging()
    // Nobody may await this until submit — keep an upload failure from being an unhandled rejection.
    this.stagedPromise.catch(() => {})
  }

  protected async attach(target: MediaUploadTarget): Promise<FileRow | undefined> {
    const result = await finalizeImage({ entityId: target.id, entityType: target.type, stagingPath: this.path })
    return result?.data
  }

  /**
   * XHR instead of `supabase.storage.upload()` for the sake of `upload.onprogress` —
   * real progress matters when a few MB take minutes on a crag connection.
   */
  private async uploadToStaging(): Promise<void> {
    enterBusy(this)
    try {
      const supabase = page.data.supabase
      if (supabase == null) {
        throw new Error('Supabase client is not available')
      }
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (token == null) {
        throw new Error('Not authenticated')
      }

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        this.xhr = xhr
        xhr.open('POST', `${PUBLIC_SUPABASE_URL}/storage/v1/object/${STAGING_BUCKET}/${this.path}`)
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        // Upsert so a retry after a lost response overwrites instead of 409ing
        // (the object may exist server-side even though the client saw a failure).
        xhr.setRequestHeader('x-upsert', 'true')
        // Browsers often report an empty type for HEIC — fall back by extension,
        // or the staging bucket's image/* restriction rejects the upload as octet-stream.
        const contentType = this.file.type !== '' ? this.file.type : imageMimeOf(this.file.name)
        if (contentType != null) {
          xhr.setRequestHeader('Content-Type', contentType)
        }
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            this.progress = event.loaded / event.total
          }
        }
        xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`${m.upload_failed()} (${xhr.status})`)))
        xhr.onerror = () => reject(new Error(m.upload_networkError()))
        xhr.onabort = () => reject(new Error(m.upload_failed()))
        xhr.send(this.file)
      })

      this.isStaged = true
      this.progress = 1
      this.status = 'staged'
    } catch (error) {
      this.status = 'failed'
      this.error = error instanceof Error ? error.message : m.upload_failed()
      throw error
    } finally {
      this.xhr = undefined
      exitBusy(this)
    }
  }
}

/**
 * The video counterpart of {@link ImageUpload}: the bytes go directly from the
 * browser to Bunny via TUS (resumable — a 2GB clip on a crag connection
 * survives dropouts), `staged` means fully at Bunny, and finalize attaches the
 * video via the `finalizeVideo` remote function.
 */
export class VideoUpload extends MediaUploadBase {
  readonly kind = 'video' as const

  /** Where the clip was grabbed from (a URL), credited on the route page. Set by the
   *  route form's video sheet before the upload is added; undefined for own footage. */
  source: string | undefined

  /** Bunny video GUID + presigned TUS auth + ownership token from `createBunnyVideo`.
   *  Created once, reused on retry so TUS resumes instead of restarting. Accepted
   *  edge: a retry after the signature's 24h expiration 401s again — remove/re-add
   *  is the recovery. */
  private auth: Awaited<ReturnType<typeof createBunnyVideo>> | undefined
  /** Current attempt's promise handles — the tus callbacks are bound once at
   *  construction, so each attempt swaps these instead of recreating the
   *  Upload (the instance retains its URL and resumes at the last offset). */
  private settle: undefined | { reject: (error: unknown) => void; resolve: () => void }
  private tusUpload: TusUpload | undefined

  /** Abort the transfer. The Bunny video object is abandoned as-is — ponytail:
   *  orphaned videos are the cleanup cron's job, no delete endpoint yet. */
  remove(): void {
    this.aborted = true
    void this.tusUpload?.abort()
    this.settle?.reject(new Error(m.upload_failed()))
    URL.revokeObjectURL(this.previewUrl)
  }

  start(): void {
    this.status = 'uploading'
    // progress deliberately kept — tus resumes at the last offset, so a retry
    // continues from where the bar stood instead of jumping back to zero.
    this.error = undefined
    this.stagedPromise = this.uploadToBunny()
    // Nobody may await this until submit — keep an upload failure from being an unhandled rejection.
    this.stagedPromise.catch(() => {})
  }

  protected async attach(target: MediaUploadTarget): Promise<FileRow | undefined> {
    if (this.auth == null) {
      throw new Error('VideoUpload.finalize() called before start()')
    }
    const result = await finalizeVideo({
      entityId: target.id,
      entityType: target.type,
      source: this.source,
      token: this.auth.token,
      videoId: this.auth.videoId,
    })
    return result?.data
  }

  private async uploadToBunny(): Promise<void> {
    enterBusy(this)
    try {
      // Create the video object once — a retry reuses id + signature so the
      // tus instance resumes instead of re-uploading from zero.
      this.auth ??= await createBunnyVideo()
      // remove() during that round-trip had nothing to abort — bail before
      // starting a transfer nobody wants.
      if (this.aborted) {
        throw new Error(m.upload_failed())
      }
      const auth = this.auth
      await new Promise<void>((resolve, reject) => {
        this.settle = { reject, resolve }
        this.tusUpload ??= new TusUpload(this.file, {
          endpoint: 'https://video.bunnycdn.com/tusupload',
          headers: {
            AuthorizationExpire: String(auth.expiration),
            AuthorizationSignature: auth.signature,
            LibraryId: PUBLIC_BUNNY_STREAM_LIBRARY_ID,
            VideoId: auth.videoId,
          },
          metadata: { filetype: this.file.type || 'video/mp4', title: this.file.name },
          onError: (error) => this.settle?.reject(error),
          onProgress: (sent, total) => (this.progress = total > 0 ? sent / total : 0),
          onSuccess: () => this.settle?.resolve(),
          retryDelays: [0, 3000, 5000, 10000, 20000],
          // Never resume across page loads: each pick creates a fresh Bunny
          // video, and tus' fingerprint ignores the VideoId header — a stale
          // localStorage entry would splice bytes into the wrong video.
          storeFingerprintForResuming: false,
        })
        this.tusUpload.start()
      })
      this.isStaged = true
      this.progress = 1
      this.status = 'staged'
    } catch (error) {
      this.status = 'failed'
      this.error = error instanceof Error ? error.message : m.upload_failed()
      throw error
    } finally {
      this.settle = undefined
      exitBusy(this)
    }
  }
}

/** Create uploads for picked files and start them immediately. The caller owns the returned objects. */
export function addUploads<T extends MediaUpload>(files: File[], Upload: new (file: File) => T): T[] {
  return files.map((file) => {
    const upload = new Upload(file)
    upload.start()
    return upload
  })
}

/**
 * Background finalizes, surfaced so the destination page (which the form navigates
 * to on submit) can show in-flight uploads as pending tiles until Zero syncs the
 * real rows. An entry lingers as a `done` tile until the target page's MediaGrid
 * sees the matching `files` row arrive and drops it (revoking the preview blob),
 * so the media never blinks out between finalize and sync. A `failed` upload also
 * lingers so its tile can offer a retry.
 */
export const pendingUploads = $state<PendingUpload[]>([])

/** Drop an upload from the registry and free its preview blob. The tile is gone
 *  after this, so it's only called once the synced row has taken over (see
 *  MediaGrid's reconcile) or the user removed it. */
export const dropPending = (upload: MediaUpload) => {
  const index = pendingUploads.findIndex((entry) => entry.upload === upload)
  if (index >= 0) {
    URL.revokeObjectURL(upload.previewUrl)
    pendingUploads.splice(index, 1)
  }
}

/**
 * The submit-side step: attach every upload to the created entity. Registers each
 * in {@link pendingUploads} so the target page can track it, then resolves with the
 * successfully created `files` rows. Failed uploads stay `failed` (with their target
 * retained) and raise a retry toast; it never throws.
 */
export async function finalizeMediaUploads(uploads: MediaUpload[], target: MediaUploadTarget): Promise<FileRow[]> {
  for (const upload of uploads) {
    if (!pendingUploads.some((entry) => entry.upload === upload)) {
      pendingUploads.push({ target, upload })
    }
  }
  // Each entry lingers until the target page's MediaGrid hands its done tile off to
  // the synced `files` row (or the user removes/retries it), so a fast one's tile is
  // never yanked out from under a slow sibling.
  const results = await Promise.allSettled(uploads.map((upload) => upload.finalize(target)))
  // Backstop for that handoff: if no grid for the target is mounted when the row
  // syncs (the user navigated elsewhere), nothing would ever drop the entry, and it
  // would pin the picked File plus its preview blob for the whole session. A done
  // tile only matters for the finalize-to-sync gap, so let go after a generous
  // window. ponytail: 5 minutes outlives any realistic sync; an offline gap longer
  // than that loses the tile, not the media.
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      setTimeout(() => dropPending(uploads[index]), 5 * 60_000)
    }
  })
  // A user-aborted upload lands on `failed` too, but it's a cancellation, not an error, so skip it.
  const failed = uploads.filter((upload) => upload.status === 'failed' && !upload.aborted)
  if (failed.length > 0) {
    // Fires even after the form navigated away, the only signal for a finalize
    // that fails once the user is no longer looking at the tiles.
    toaster.create({
      action: { label: m.common_retry(), onClick: () => failed.forEach((upload) => void retryPending(upload)) },
      duration: Number.POSITIVE_INFINITY,
      title: m.upload_someFailed(),
      type: 'error',
    })
  }
  return results.filter((result) => result.status === 'fulfilled').map((result) => result.value)
}

/** Abort a pending upload and drop it from {@link pendingUploads}. */
export function removePending(upload: MediaUpload): void {
  upload.remove()
  dropPending(upload)
}

/** Retry a failed upload. If it finalizes, its entry is left in {@link pendingUploads}
 *  for the target page's MediaGrid to hand off to the synced row (same as a first-try
 *  success); a form's own tiles retry the transfer only and never reach that path. */
export async function retryPending(upload: MediaUpload): Promise<void> {
  await upload.retry().catch(() => {})
}
