<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    class?: string
    children?: Snippet
    href?: string
  }

  const { class: className, children, href }: Props = $props()
</script>

<a class="btn preset-tonal btn-sm md:btn-base shrink-0 snap-start {className}" {href}>
  {@render children?.()}
</a>
