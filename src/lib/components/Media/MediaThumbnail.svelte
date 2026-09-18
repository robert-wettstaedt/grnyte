<script lang="ts">
  import Avatar from '$lib/components/Avatar/Avatar.svelte'
  import type { MediaFile } from '$lib/entities/file/dto'
  import type { DerivativeSize } from '$lib/images/derivatives'
  import { m } from '$lib/paraglide/messages'
  import { openMedia } from '$lib/state/navigation.svelte'
  import { videoView } from '$lib/videos/view.svelte'
  import type { ClassValue } from 'svelte/elements'
  import MediaTile from './MediaTile.svelte'

  interface Props {
    /** Badge ascent-owned files with the climber's avatar, linking beta to its ascent.
     *  Off where the row already names the climber (e.g. an ascent row's own strip). */
    badged?: boolean
    /** Extra tile classes: the grid sets the tile's height here; width follows the aspect ratio. */
    class?: ClassValue
    /** Drop the placeholder captions to icon-only, for a tile too short to fit two lines.
     *  The `aria-label` carries the wording either way. */
    compact?: boolean
    file: MediaFile
    /** Which derivative to load. Defaults to the small one: pass 1024 only for tiles big
     *  enough that 256 would look soft on a retina screen. */
    previewWidth?: DerivativeSize
  }

  const { badged = false, class: className, compact = false, file, previewWidth = 256 }: Props = $props()

  // Open the viewer through the URL so it earns its own history entry (the back
  // button closes it) and the open media is deep-linkable and shareable. The grid
  // owns the (single) viewer and reads this param.
  const openViewer = () => openMedia(file.id)

  // A preparing tile stays a button, so Delete in the viewer stays reachable.

  // Read again rather than lifted out of the tile: the label belongs to the button, and reading a
  // pure derivation twice is not a second opinion.
  const view = $derived(videoView(file))
  const label = $derived(
    view?.kind === 'preparing'
      ? m.media_videoPreparing()
      : view?.kind === 'unavailable'
        ? m.media_videoUnavailable()
        : file.bunnyStreamFk != null
          ? m.common_playVideo()
          : m.media_openImage(),
  )
</script>

<!-- The button carries the caller's sizing (height, snap) and shrink-wraps; the tile inside fills
     that height and takes its width from the aspect ratio. `rounded-lg` is here purely for the
     focus ring: `app.css` draws it with a box-shadow, which follows the FOCUSED element's radius,
     so without it a keyboard user gets square corners around a rounded tile. The tile does its own
     clipping. -->
<button type="button" class={['inline-flex shrink-0 rounded-lg', className]} aria-label={label} onclick={openViewer}>
  <MediaTile class="h-full" {compact} {file} {previewWidth}>
    <!-- Ascent-owned media carries the climber's avatar, so the grid itself shows
         whose beta each tile is; route-level files stay plain. -->
    {#if badged && file.ascent != null && file.uploader != null}
      <span class="pointer-events-none absolute bottom-1.5 left-1.5 rounded-full ring-2 ring-black/40">
        <Avatar name={file.uploader.username} size={22} solid />
      </span>
    {/if}
  </MediaTile>
</button>
