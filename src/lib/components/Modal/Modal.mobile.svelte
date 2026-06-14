<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import { Portal } from '@skeletonlabs/skeleton-svelte'
  import { BottomSheet } from 'svelte-bottom-sheet'
  import type { Props } from './types'

  let { children, open = $bindable(), snapPoints = [0.5], subtitle, title, trigger }: Props = $props()
</script>

{@render trigger?.({})}

{#snippet content()}
  <BottomSheet.Sheet class="preset-filled-surface-50-950!">
    <div
      class="preset-filled-surface-50-950 border-surface-100-900 sticky top-0 z-100 flex items-center justify-between border-b-2 px-4 py-2"
    >
      <div class="flex flex-col">
        {#if subtitle}
          <span class="text-sm opacity-60">{subtitle}</span>
        {/if}

        <span class="text-lg">{title}</span>
      </div>

      <button
        class="btn-icon"
        aria-label={m.common_close()}
        onclick={(event) => {
          event.preventDefault()
          open = false
        }}
      >
        <Icon name="close" />
      </button>
    </div>

    <BottomSheet.Content class="w-full px-4! pt-4!">
      {@render children?.()}
    </BottomSheet.Content>
  </BottomSheet.Sheet>
{/snippet}

<Portal>
  <BottomSheet settings={{ maxHeight: snapPoints[0], snapPoints }} bind:isSheetOpen={open}>
    {@render content()}
  </BottomSheet>
</Portal>
