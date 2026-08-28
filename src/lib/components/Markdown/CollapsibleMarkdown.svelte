<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages.js'
  import type { Attachment } from 'svelte/attachments'
  import Markdown from './Markdown.svelte'

  interface Props {
    markdown: string
  }

  const { markdown }: Props = $props()

  // Collapse long descriptions behind a toggle. Must match the `max-h-40` clamp
  // below so the "show more" affordance only appears when content is clipped.
  const collapsedHeight = 160

  let expanded = $state(false)
  let overflows = $state(false)

  // Overflow depends on rendered layout (`scrollHeight`), which can't be a pure
  // $derived, so measure via an attachment. Passing the markdown makes it
  // re-run (and re-collapse) whenever the body changes.
  const measure =
    (value: string): Attachment =>
    (node) => {
      void value
      expanded = false
      overflows = node.scrollHeight > collapsedHeight
    }
</script>

<!-- Guarded here rather than at every call site: the mappers normalise a NULL description to '',
     so an unguarded caller would render an empty clamped box and a gap. -->
{#if markdown.trim() !== ''}
  <div class="space-y-1">
    <div
      class={['overflow-hidden', !expanded && 'max-h-40', !expanded && overflows && 'fade-bottom']}
      {@attach measure(markdown)}
    >
      <Markdown className="leading-relaxed" {markdown} />
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
{/if}

<style>
  /* Fade the clipped text to transparent so the cut-off reads as intentional,
     regardless of the surface the description sits on. */
  .fade-bottom {
    mask-image: linear-gradient(to bottom, black 60%, transparent);
  }
</style>
