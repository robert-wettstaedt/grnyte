<script lang="ts">
  import { getI18n } from '$lib/i18n'
  import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte'
  import { sheetState } from './sheetState.svelte'
  import type { ModalProps } from './types'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'

  let { base, children, title }: ModalProps = $props()

  const { t } = getI18n()

  // Keep compatibility with callers that may still set this value.
  $effect(() => {
    if (sheetState.requestSnap != null) {
      sheetState.requestSnap = null
    }
  })
</script>

<div class="flex">
  {@render base()}

  <div use:fitHeightAction={{ paddingBottom: 16 }}>
    <div
      class="preset-filled-surface-100-900 my-2 me-2 h-full w-sm overflow-x-hidden overflow-y-auto rounded-lg shadow-lg"
    >
      <h2 class="preset-filled-surface-100-900 sticky top-0 mb-4 p-4 shadow">
        {@render title()}
      </h2>

      {@render children?.()}
    </div>
  </div>
</div>
