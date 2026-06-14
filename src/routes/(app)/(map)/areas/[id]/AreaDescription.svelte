<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Markdown from '$lib/components/Markdown/Markdown.svelte'
  import { m } from '$lib/paraglide/messages.js'
  import type { Attachment } from 'svelte/attachments'

  interface Props {
    description: string
  }

  const { description }: Props = $props()

  // Collapse long descriptions behind a toggle. Must match the `max-h-40` clamp
  // below so the "show more" affordance only appears when content is clipped.
  const collapsedHeight = 160

  let expanded = $state(false)
  let overflows = $state(false)

  // Overflow depends on rendered layout (`scrollHeight`), which can't be a pure
  // $derived, so measure via an attachment. Passing the markdown makes it
  // re-run — and re-collapse — whenever the description changes.
  const measure =
    (markdown: string): Attachment =>
    (node) => {
      void markdown
      expanded = false
      overflows = node.scrollHeight > collapsedHeight
    }
</script>

<div class="space-y-1">
  <div
    class={['overflow-hidden', !expanded && 'max-h-40', !expanded && overflows && 'fade-bottom']}
    {@attach measure(description)}
  >
    <Markdown className="leading-relaxed" markdown={description} />
  </div>

  {#if overflows}
    <button
      type="button"
      class="text-primary-500 mx-auto flex items-center gap-1 text-sm font-medium"
      onclick={() => (expanded = !expanded)}
    >
      {expanded ? m.common_showLess() : m.common_showMore()}
      <span class={['inline-flex transition-transform', expanded && 'rotate-180']}>
        <Icon name="chevron-down" size={16} />
      </span>
    </button>
  {/if}
</div>

<style>
  /* Fade the clipped text to transparent so the cut-off reads as intentional,
     regardless of the surface the description sits on. */
  .fade-bottom {
    mask-image: linear-gradient(to bottom, black 60%, transparent);
  }
</style>
