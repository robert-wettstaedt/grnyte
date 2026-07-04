/**
 * Client half of the image upload flow. Files start uploading to the Supabase
 * staging bucket the moment they're picked — in parallel with form filling —
 * and after the entity is created the form calls {@link finalizeImageUploads},
 * which attaches each staged file via the `finalizeImage` remote function
 * (record-first: the entity never waits for its media).
 *
 * Uploads are plain objects owned by the form; the XHR and finalize promises
 * keep running when components unmount or the route changes, so only closing
 * the tab kills them — which the beforeunload guard warns about while any
 * upload is busy.
 */
import { page } from '$app/state'
import { PUBLIC_SUPABASE_URL } from '$env/static/public'
import type { File as FileRow } from '$lib/db/schema'
import { m } from '$lib/paraglide/messages'
import { SvelteMap } from 'svelte/reactivity'
import { finalizeImage } from './files.remote'
import { imageMimeOf, STAGING_BUCKET, stagingPath, type FileEntityType } from './upload'

export type ImageUploadStatus = 'uploading' | 'staged' | 'finalizing' | 'done' | 'failed'

export interface ImageUploadTarget {
  type: FileEntityType
  id: number
}

// Warn on tab close while any upload is transferring or finalizing — a staged
// file that hasn't been submitted loses nothing, so it doesn't count as busy.
// Refcounted per upload: staging and finalizing overlap on the same object.
const busy = new SvelteMap<ImageUpload, number>()
const guard = (event: BeforeUnloadEvent) => event.preventDefault()
const syncGuard = () => {
  if (busy.size > 0) {
    window.addEventListener('beforeunload', guard)
  } else {
    window.removeEventListener('beforeunload', guard)
  }
}
const enterBusy = (upload: ImageUpload) => {
  busy.set(upload, (busy.get(upload) ?? 0) + 1)
  syncGuard()
}
const exitBusy = (upload: ImageUpload) => {
  const count = (busy.get(upload) ?? 1) - 1
  if (count <= 0) {
    busy.delete(upload)
  } else {
    busy.set(upload, count)
  }
  syncGuard()
}

export class ImageUpload {
  readonly file: File
  /** Object URL for the local preview thumbnail; revoked once the upload leaves the UI. */
  readonly previewUrl: string
  /** Path in the staging bucket — stable for the upload's lifetime, usable as a list key. */
  readonly path: string

  status = $state<ImageUploadStatus>('uploading')
  /** Bytes sent to staging, 0..1. */
  progress = $state(0)
  error = $state<string>()
  /** The created `files` row once finalized. */
  fileRow = $state.raw<FileRow>()

  /** Whether the file has fully landed in the staging bucket. */
  private isStaged = false
  /** Resolves when staging completes; rejects on upload failure. Recreated by each attempt. */
  private stagedPromise: Promise<void> = Promise.resolve()
  private target: ImageUploadTarget | undefined
  private xhr: XMLHttpRequest | undefined
  /** In-flight finalize, shared so overlapping submit/retry await one attempt instead of double-attaching. */
  private finalizePromise: Promise<FileRow> | undefined

  constructor(file: File) {
    this.file = file
    this.previewUrl = URL.createObjectURL(file)
    this.path = stagingPath(page.data.authUserId ?? '', file.name)
  }

  /** Kick off (or restart) the staging upload. Does not throw — failure lands in `status`/`error`. */
  start(): void {
    this.status = 'uploading'
    this.progress = 0
    this.error = undefined
    this.stagedPromise = this.uploadToStaging()
    // Nobody may await this until submit — keep an upload failure from being an unhandled rejection.
    this.stagedPromise.catch(() => {})
  }

  /**
   * Attach the upload to its entity: wait for staging to complete, then run the
   * `finalizeImage` remote function. Throws on failure, leaving the upload in
   * `failed` with the target retained so {@link retry} can resume.
   */
  async finalize(target: ImageUploadTarget): Promise<FileRow> {
    // Idempotent: a resubmitted form re-finalizes every upload — an attached
    // one just returns its row (the staging object is gone, so re-running the
    // remote function would flip a done upload to failed).
    if (this.fileRow != null) {
      return this.fileRow
    }
    return (this.finalizePromise ??= this.runFinalize(target).finally(() => (this.finalizePromise = undefined)))
  }

  private async runFinalize(target: ImageUploadTarget): Promise<FileRow> {
    this.target = target
    enterBusy(this)
    try {
      await this.stagedPromise
      this.status = 'finalizing'
      const result = await finalizeImage({ stagingPath: this.path, entityType: target.type, entityId: target.id })
      this.fileRow = result?.data
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

  /** Resume after a failure: re-upload if staging didn't finish, re-finalize if a target is set. */
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

  /** Abort the transfer and delete the staged object. The owner drops the reference. */
  remove(): void {
    this.xhr?.abort()
    if (this.isStaged) {
      // Fire-and-forget — a leftover object is the cleanup cron's job.
      void page.data.supabase?.storage.from(STAGING_BUCKET).remove([this.path])
    }
    URL.revokeObjectURL(this.previewUrl)
    busy.delete(this)
    syncGuard()
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
      if (this.status === 'uploading') {
        this.status = 'staged'
      }
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

/** Create uploads for picked files and start them immediately. The caller owns the returned objects. */
export function addImageUploads(files: File[]): ImageUpload[] {
  return files.map((file) => {
    const upload = new ImageUpload(file)
    upload.start()
    return upload
  })
}

/**
 * The submit-side step: attach every upload to the created entity. Resolves with
 * the successfully created `files` rows; failed uploads stay `failed` (with their
 * target retained) for the UI to offer a retry — it never throws.
 */
export async function finalizeImageUploads(uploads: ImageUpload[], target: ImageUploadTarget): Promise<FileRow[]> {
  const results = await Promise.allSettled(uploads.map((upload) => upload.finalize(target)))
  return results.filter((result) => result.status === 'fulfilled').map((result) => result.value)
}
