<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import { BottomSheet } from 'svelte-bottom-sheet'
  import type { Props } from './types'

  let { children, open = $bindable(), subtitle, title, trigger }: Props = $props()

  let titleEl = $state<HTMLElement>()
  let contentEl = $state<HTMLElement>()
  let innerHeight = $state(window.innerHeight)

  function calc() {
    const titleHeight = titleEl?.clientHeight
    const contentHeight = contentEl?.parentElement?.parentElement?.clientHeight

    if (typeof window === 'undefined' || contentHeight == null || contentHeight === 0 || titleHeight == null) {
      return 0.75
    }

    return Number(Math.min((contentHeight + titleHeight) / innerHeight, 0.9).toFixed(2))
  }

  const maxHeight = $derived.by(calc)
</script>

<svelte:window bind:innerHeight />

{@render trigger?.({})}

{#snippet content()}
  <BottomSheet.Sheet class="preset-filled-surface-50-950!">
    <div
      bind:this={titleEl}
      class="preset-filled-surface-50-950 sticky z-100 flex items-center justify-between px-4 py-2 shadow"
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
      <div bind:this={contentEl}>
        {@render children?.()}
      </div>
    </BottomSheet.Content>
  </BottomSheet.Sheet>
{/snippet}

<BottomSheet
  settings={{
    maxHeight,
    snapPoints: [1],
  }}
  bind:isSheetOpen={open}
>
  {@render content()}
</BottomSheet>
