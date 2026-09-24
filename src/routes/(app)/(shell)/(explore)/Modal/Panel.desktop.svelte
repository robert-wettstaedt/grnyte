<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import { resetOnNavigate } from '$lib/state/scroll'
  import NavFooter from './NavFooter.svelte'
  import SheetHeading from './SheetHeading.svelte'
  import { sheetState } from './sheetState.svelte'
  import type { ModalProps } from './types'

  let { children, onclose, open = $bindable() }: ModalProps = $props()
</script>

{#if open}
  <aside
    class="border-surface-100-900 bg-surface-50-950 fixed inset-y-0 right-0 z-40 flex w-94 flex-col border-l-2 lg:w-105"
  >
    <header class="border-surface-100-900 flex shrink-0 flex-col gap-2 border-b-2 px-4 py-3">
      <div class="flex items-center gap-3">
        <button
          class="btn-icon preset-filled-surface-200-800 shrink-0"
          aria-label={m.common_back()}
          onclick={() => {
            open = false
            onclose?.()
          }}
        >
          <Icon name="arrow-left" />
        </button>

        <SheetHeading />
      </div>

      {#if sheetState.toolbar}
        {@render sheetState.toolbar()}
      {/if}
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto p-4" {@attach resetOnNavigate}>
      {@render children?.()}
    </div>

    <NavFooter />
  </aside>
{/if}
