<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import { ImageUpload, VideoUpload, type MediaUploadStatus } from '$lib/entities/file/upload-manager.svelte'
  import type { ComponentProps } from 'svelte'
  import MediaDropZone from './MediaDropZone.svelte'

  const { Story } = defineMeta({
    title: 'Components/MediaDropZone',
    component: MediaDropZone,
    tags: ['autodocs'],
    parameters: {
      layout: 'centered',
    },
  })

  // A real 1x1 png so the preview thumbnails render.
  const png = Uint8Array.from(
    atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
    (char) => char.charCodeAt(0),
  )

  const fake = (name: string, status: MediaUploadStatus, patch: { progress?: number; error?: string } = {}) => {
    const upload = new ImageUpload(new File([png], name, { type: 'image/png' }))
    upload.status = status
    upload.progress = patch.progress ?? 0
    upload.error = patch.error
    return upload
  }

  // Constructor only creates the preview object URL — start() is never called,
  // so no Bunny traffic. The fake bytes aren't a decodable video, so the
  // <video> thumbnail renders as a dark box, which is fine for eyeballing.
  const fakeVideo = (name: string, status: MediaUploadStatus, patch: { progress?: number; error?: string } = {}) => {
    const upload = new VideoUpload(new File([png], name, { type: 'video/mp4' }))
    upload.status = status
    upload.progress = patch.progress ?? 0
    upload.error = patch.error
    return upload
  }

  // Dropping a file here starts a real upload, which fails without a backend —
  // handy for eyeballing the failed state; the full flow needs the app.
  const states = [
    fake('boulder-topo.jpg', 'uploading', { progress: 0.45 }),
    fake('IMG_2041.heic', 'staged', { progress: 1 }),
    fake('crux-beta.png', 'finalizing'),
    fake('sunset-session.jpg', 'done'),
    fake('flaky-connection.jpg', 'failed', { error: 'Network error — check your connection' }),
  ]

  const videoStates = [
    fake('boulder-topo.jpg', 'staged', { progress: 1 }),
    fakeVideo('send-attempt.mp4', 'uploading', { progress: 0.3 }),
    fakeVideo('topout.mov', 'done'),
  ]
</script>

{#snippet template(args: ComponentProps<typeof MediaDropZone>)}
  <div style="width: 400px;">
    <MediaDropZone {...args} />
  </div>
{/snippet}

<Story name="Empty" {template} />

<Story name="Upload states" args={{ uploads: states }} {template} />

<Story name="With videos" args={{ accept: ['image', 'video'], uploads: videoStates }} {template} />

<Story name="Videos only" args={{ accept: ['video'] }} {template} />

<Story name="Disabled" args={{ disabled: true }} {template} />
