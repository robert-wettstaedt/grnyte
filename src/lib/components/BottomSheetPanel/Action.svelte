<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    children?: Snippet
    href?: string
  }

  const { children, href }: Props = $props()
</script>

<a class="btn preset-tonal btn-sm md:btn-base shrink-0 snap-start" {href}>
  {@render children?.()}
</a>
