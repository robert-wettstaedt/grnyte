<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages.js'
  import type { Attachment } from 'svelte/attachments'
  import Markdown from './Markdown.svelte'

  interface Props {
    markdown: string
  }

  const { markdown }: Props = $props()

  // Collapse long descriptions behind a toggle.
  const collapsedHeight = 160

  let expanded = $state(false)
  let overflows = $state(false)
  let fullHeight = $state(0)
  let body: HTMLDivElement | undefined = $state()

  // Overflow depends on rendered layout (`scrollHeight`), which can't be a pure
  // $derived, so measure via an attachment. Passing the markdown makes it
  // re-run (and re-collapse) whenever the body changes.
  const measure =
    (value: string): Attachment =>
    (node) => {
      void value
      expanded = false
      fullHeight = node.scrollHeight
      overflows = node.scrollHeight > collapsedHeight
    }

  // A pixel height on both ends, because `max-height` cannot animate to `none`. Re-measured on the
  // press so a body that reflowed since mount (a font, a resolved mention) still opens in full.
  const toggle = () => {
    if (body != null) {
      fullHeight = body.scrollHeight
    }
    expanded = !expanded
  }
</script>

<!-- Guarded here rather than at every call site: the mappers normalise a NULL description to '',
     so an unguarded caller would render an empty clamped box and a gap. -->
{#if markdown.trim() !== ''}
  <div class="space-y-1">
    <div
      bind:this={body}
      class={[
        'overflow-hidden transition-[max-height] duration-150 motion-reduce:transition-none',
        !expanded && overflows && 'fade-bottom',
      ]}
      style:max-height={overflows ? `${expanded ? fullHeight : collapsedHeight}px` : undefined}
      {@attach measure(markdown)}
    >
      <Markdown className="leading-relaxed" {markdown} />
    </div>

    {#if overflows}
      <button
        type="button"
        class="text-primary-500 mx-auto flex items-center gap-1 text-sm font-medium"
        onclick={toggle}
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
