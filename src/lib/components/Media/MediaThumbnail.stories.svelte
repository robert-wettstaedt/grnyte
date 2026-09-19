<script module lang="ts">
  import type { MediaFile, VideoReadiness } from '$lib/entities/file/dto'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import MediaThumbnail from './MediaThumbnail.svelte'

  const { Story } = defineMeta({
    component: MediaThumbnail,
    parameters: {
      layout: 'centered',
    },
    tags: ['autodocs'],
    title: 'Components/MediaThumbnail',
  })

  /**
   * A video tile in one readiness state, so `pending` and `failed` stay reviewable once no real
   * video is pending. The GUID is not a real one: those two states never reach the network, and
   * `ready` is expected to fall through to its placeholder.
   */
  const video = (readiness: VideoReadiness): MediaFile => ({
    ascentCreatedBy: undefined,
    bunnyStreamFk: '00000000-0000-4000-8000-00000000f00d',
    createdAt: Date.now() - 3_600_000,
    height: undefined,
    id: `video-${readiness}`,
    path: '',
    readiness,
    regionFk: 1,
    source: undefined,
    uploader: undefined,
    visibility: 'private',
    width: undefined,
  })
</script>

<Story name="Preparing" args={{ class: 'h-40', file: video('pending') }} />

<Story name="Unavailable" args={{ class: 'h-40', file: video('failed') }} />

<Story name="Ready" args={{ class: 'h-40', file: video('ready') }} />
