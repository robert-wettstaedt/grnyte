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
import { SvelteMap } from 'svelte/reactivity'
import { Upload as TusUpload } from 'tus-js-client'
import { createBunnyVideo, finalizeImage, finalizeVideo } from './files.remote'
import { imageMimeOf, STAGING_BUCKET, stagingPath, type FileEntityType } from './upload'

export type MediaUploadStatus = 'uploading' | 'staged' | 'finalizing' | 'done' | 'failed'

export interface MediaUploadTarget {
  type: FileEntityType
  id: number
}

/** What a drop zone holds and a form finalizes — `kind` discriminates the two pipelines. */
export type MediaUpload = ImageUpload | VideoUpload

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

/**
 * The status machine both pipelines share. Subclasses own the transfer
 * (staging XHR / Bunny TUS) and provide {@link attach} — the finalize remote
 * call that runs once the bytes have landed.
 */
abstract class MediaUploadBase {
  readonly file: File
  /** Object URL for the local preview; revoked once the upload leaves the UI. */
  readonly previewUrl: string

  status = $state<MediaUploadStatus>('uploading')
  /** Bytes transferred, 0..1. */
  progress = $state(0)
  error = $state<string>()
  /** The created `files` row once finalized. */
  fileRow = $state.raw<FileRow>()

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

  /** Kick off (or resume) the transfer. Does not throw — failure lands in `status`/`error`. */
  abstract start(): void
  /** Abort the transfer and drop whatever landed. The owner drops the reference. */
  abstract remove(): void
  /** The finalize remote call — runs once the transfer has completed. */
  protected abstract attach(target: MediaUploadTarget): Promise<FileRow | undefined>

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

  private async runFinalize(target: MediaUploadTarget): Promise<FileRow> {
    this.target = target
    enterBusy(this)
    try {
      await this.stagedPromise
      this.status = 'finalizing'
      this.fileRow = await this.attach(target)
      this.status = 'done'
      URL.revokeObjectURL(this.previewUrl)
      return this.fileRow!
    } catch (error) {
      this.status = 'failed'
      this.error ??= error instanceof Error ? error.message : m.upload_failed()
      throw error
    } finally {
      exitBusy(this)
    }
  }

  /** Resume after a failure: re-run the transfer if it didn't finish, re-finalize if a target is set. */
  async retry(): Promise<void> {
    if (!this.isStaged) {
      this.start()
    } else {
      this.error = undefined
    }
    if (this.target != null) {
      await this.finalize(this.target)
    }
  }
}

export class ImageUpload extends MediaUploadBase {
  readonly kind = 'image' as const
  /** Path in the staging bucket — stable for the upload's lifetime, usable as a list key. */
  readonly path: string

  private xhr: XMLHttpRequest | undefined

  constructor(file: File) {
    super(file)
    this.path = stagingPath(page.data.authUserId ?? '', file.name)
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
    const result = await finalizeImage({ stagingPath: this.path, entityType: target.type, entityId: target.id })
    return result?.data
  }

  /** Abort the transfer and delete the staged object. */
  remove(): void {
    this.xhr?.abort()
    if (this.isStaged) {
      // Fire-and-forget — a leftover object is the cleanup cron's job.
      void page.data.supabase?.storage.from(STAGING_BUCKET).remove([this.path])
    }
    URL.revokeObjectURL(this.previewUrl)
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
  private tusUpload: TusUpload | undefined
  /** Current attempt's promise handles — the tus callbacks are bound once at
   *  construction, so each attempt swaps these instead of recreating the
   *  Upload (the instance retains its URL and resumes at the last offset). */
  private settle: { resolve: () => void; reject: (error: unknown) => void } | undefined
  /** Set by {@link remove} so a transfer it couldn't abort yet bails instead of starting. */
  private removed = false

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
      videoId: this.auth.videoId,
      token: this.auth.token,
      entityType: target.type,
      entityId: target.id,
      source: this.source,
    })
    return result?.data
  }

  /** Abort the transfer. The Bunny video object is abandoned as-is — ponytail:
   *  orphaned videos are the cleanup cron's job, no delete endpoint yet. */
  remove(): void {
    this.removed = true
    void this.tusUpload?.abort()
    this.settle?.reject(new Error(m.upload_failed()))
    URL.revokeObjectURL(this.previewUrl)
  }

  private async uploadToBunny(): Promise<void> {
    enterBusy(this)
    try {
      // Create the video object once — a retry reuses id + signature so the
      // tus instance resumes instead of re-uploading from zero.
      this.auth ??= await createBunnyVideo()
      // remove() during that round-trip had nothing to abort — bail before
      // starting a transfer nobody wants.
      if (this.removed) {
        throw new Error(m.upload_failed())
      }
      const auth = this.auth
      await new Promise<void>((resolve, reject) => {
        this.settle = { resolve, reject }
        this.tusUpload ??= new TusUpload(this.file, {
          endpoint: 'https://video.bunnycdn.com/tusupload',
          retryDelays: [0, 3000, 5000, 10000, 20000],
          headers: {
            AuthorizationSignature: auth.signature,
            AuthorizationExpire: String(auth.expiration),
            VideoId: auth.videoId,
            LibraryId: PUBLIC_BUNNY_STREAM_LIBRARY_ID,
          },
          metadata: { filetype: this.file.type || 'video/mp4', title: this.file.name },
          // Never resume across page loads: each pick creates a fresh Bunny
          // video, and tus' fingerprint ignores the VideoId header — a stale
          // localStorage entry would splice bytes into the wrong video.
          storeFingerprintForResuming: false,
          onProgress: (sent, total) => (this.progress = total > 0 ? sent / total : 0),
          onError: (error) => this.settle?.reject(error),
          onSuccess: () => this.settle?.resolve(),
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
 * The submit-side step: attach every upload to the created entity. Resolves with
 * the successfully created `files` rows; failed uploads stay `failed` (with their
 * target retained) for the UI to offer a retry — it never throws.
 */
export async function finalizeMediaUploads(uploads: MediaUpload[], target: MediaUploadTarget): Promise<FileRow[]> {
  const results = await Promise.allSettled(uploads.map((upload) => upload.finalize(target)))
  return results.filter((result) => result.status === 'fulfilled').map((result) => result.value)
}
