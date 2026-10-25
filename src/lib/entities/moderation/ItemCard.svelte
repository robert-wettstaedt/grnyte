<script lang="ts">
  import Image from '$lib/components/Image/Image.svelte'
  import Markdown from '$lib/components/Markdown/Markdown.svelte'
  import { m } from '$lib/paraglide/messages'
  import type { RemovableKind, RemovalItem } from './dto'

  interface Props {
    /** What the photo is, in the form's own words. */
    alt?: string
    item: RemovalItem
    kind: RemovableKind
  }

  const { alt = m.moderation_photo(), item, kind }: Props = $props()
</script>

<section class="card bg-surface-100-900 space-y-2 p-4">
  {#if item.image != null}
    <Image {alt} class="aspect-[4/3] w-full overflow-hidden rounded-lg" path={item.image} previewWidth={1024} />
  {/if}
  {#if item.title !== ''}
    <h2 class="text-surface-950-50 font-semibold">{item.title}</h2>
  {/if}
  {#if item.byline != null}
    <p class="text-surface-600-400 text-xs">{m.moderation_byline({ name: item.byline })}</p>
  {/if}
  {#if item.body != null && item.body !== ''}
    <Markdown
      className={kind === 'comment' ? 'text-sm break-words' : 'line-clamp-6 text-sm break-words'}
      markdown={item.body}
    />
  {/if}
</section>
