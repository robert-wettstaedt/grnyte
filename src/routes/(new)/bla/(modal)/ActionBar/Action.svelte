<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements'

  type Props = (HTMLAnchorAttributes & { children?: Snippet }) | (HTMLButtonAttributes & { children?: Snippet })

  const { children, ...props }: Props = $props()
</script>

{#if (props as HTMLAnchorAttributes).href != null}
  <a
    {...props as HTMLAnchorAttributes}
    class={['btn preset-tonal btn-sm md:btn-base shrink-0 snap-start', props.class]}
  >
    {@render children?.()}
  </a>
{:else if (props as HTMLButtonAttributes).onclick != null}
  <button
    {...props as HTMLButtonAttributes}
    class={['btn preset-tonal btn-sm md:btn-base shrink-0 snap-start', props.class]}
  >
    {@render children?.()}
  </button>
{/if}
