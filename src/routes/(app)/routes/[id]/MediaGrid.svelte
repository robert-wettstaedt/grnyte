<script lang="ts">
  import { PUBLIC_BUNNY_STREAM_LIBRARY_ID } from '$env/static/public'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Image from '$lib/components/Image/Image.svelte'
  import type { MediaFile } from '$lib/entities/file/dto'
  import { m } from '$lib/paraglide/messages.js'

  interface Props {
    items: MediaFile[]
  }

  const { items }: Props = $props()

  // Bunny Stream playback via the iframe embed; bytes never touch our servers.
  // ponytail: no poster image — the library blocks direct pull-zone access
  // (403), so thumbnails need server-signed URLs. Add those if plain tiles hurt.
  const embedUrl = (guid: string) =>
    `https://iframe.mediadelivery.net/embed/${PUBLIC_BUNNY_STREAM_LIBRARY_ID}/${guid}?autoplay=true`

  let playingId = $state<string>()
</script>

<div class="grid grid-cols-3 gap-2">
  {#each items as file (file.id)}
    {#if file.bunnyStreamFk == null}
      <div class="bg-surface-950 aspect-square overflow-hidden rounded-lg">
        <Image path={file.path} alt="" class="h-full w-full" previewWidth={256} />
      </div>
    {:else if playingId === file.id}
      <!-- The playing video takes the full row so it isn't squeezed into a square tile. -->
      <div class="col-span-full aspect-video overflow-hidden rounded-lg">
        <iframe
          class="h-full w-full"
          src={embedUrl(file.bunnyStreamFk)}
          title={m.common_playVideo()}
          allow="autoplay; fullscreen; picture-in-picture"
          allowfullscreen
        ></iframe>
      </div>
    {:else}
      <button
        class="bg-surface-950 relative aspect-square overflow-hidden rounded-lg"
        onclick={() => (playingId = file.id)}
        type="button"
        aria-label={m.common_playVideo()}
      >
        <span class="absolute inset-0 flex items-center justify-center">
          <span class="flex size-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur">
            <Icon name="play" size={20} fill="currentColor" />
          </span>
        </span>
      </button>
    {/if}
  {/each}
</div>
