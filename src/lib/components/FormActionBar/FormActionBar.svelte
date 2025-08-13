<script lang="ts">
  import type { EnhanceState } from '$lib/forms/enhance.svelte'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    label: string
    state: EnhanceState
  }

  const { label, state }: Props = $props()
</script>

<div class="mt-8 flex justify-between md:items-center">
  <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">Cancel</button>

  <button class="btn preset-filled-primary-500" type="submit" disabled={state.loading}>
    {#if state.loading}
      <span class="me-2">
        <ProgressRing size="size-4" value={null} />
      </span>
    {/if}

    {label}
  </button>
</div>
