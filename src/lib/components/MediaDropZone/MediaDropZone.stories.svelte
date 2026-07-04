<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import { ImageUpload, type ImageUploadStatus } from '$lib/entities/file/upload-manager.svelte'
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

  const fake = (name: string, status: ImageUploadStatus, patch: { progress?: number; error?: string } = {}) => {
    const upload = new ImageUpload(new File([png], name, { type: 'image/png' }))
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
</script>

{#snippet template(args: ComponentProps<typeof MediaDropZone>)}
  <div style="width: 400px;">
    <MediaDropZone {...args} />
  </div>
{/snippet}

<Story name="Empty" {template} />

<Story name="Upload states" args={{ uploads: states }} {template} />

<Story name="Disabled" args={{ disabled: true }} {template} />
