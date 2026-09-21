<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { ImageFailure } from '$lib/components/Image/failure'
  import { m } from '$lib/paraglide/messages'

  const { failure }: { failure: ImageFailure | undefined } = $props()
</script>

<!-- Corner chrome for a topo with no photo, because the centred placeholder sits exactly where the
     lines are drawn. The cause is worth saying: an offline photo comes back, a deleted one does not.
     Plain text, not a labelled `img`: the broken `<img>` still carries `alt` for a screen reader,
     and a role here would swallow the one sentence that says why the photo is missing. -->
<div
  class="bg-surface-950/70 text-surface-300 absolute top-2 left-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs"
>
  <Icon name={failure === 'offline' ? 'no-signal' : 'image-off'} size={14} />
  <!-- The wording does not fit a topo in the block page's strip, where it was clipped mid-word by
       the box it sits in. Narrow keeps the icon and hides the words from sight only: a query on the
       topo's own width, since the same component draws at both sizes on one screen. -->
  <span class="sr-only @min-[16rem]:not-sr-only">
    {failure === 'offline' ? m.topo_photoOffline() : m.topo_photoMissing()}
  </span>
</div>
