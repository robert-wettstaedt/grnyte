<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    children?: Snippet
    class?: string
    href?: string
    onclick?: () => void
  }

  const { children, class: className, href, onclick }: Props = $props()
</script>

{#if href != null}
  <a class="btn preset-tonal btn-sm md:btn-base shrink-0 snap-start {className}" {href}>
    {@render children?.()}
  </a>
{:else if onclick != null}
  <button class="btn preset-tonal btn-sm md:btn-base shrink-0 snap-start {className}" {onclick}>
    {@render children?.()}
  </button>
{/if}
