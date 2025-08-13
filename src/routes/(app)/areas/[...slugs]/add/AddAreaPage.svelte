<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'
  import AreaFormFields from '$lib/components/AreaFormFields'
  import type { Row } from '$lib/db/zero'
  import { enhanceForm, type EnhanceState } from '$lib/forms/enhance.svelte'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import { createArea } from './page.remote'

  interface Props {
    parent?: Row<'areas'>
  }

  let { parent }: Props = $props()
  let basePath = $derived(`/areas/${page.params.slugs}`)
  let state = $state<EnhanceState>({})
</script>

<svelte:head>
  {#if parent == null}
    <title>Create area - {PUBLIC_APPLICATION_NAME}</title>
  {:else}
    <title>Create area in {parent.name} - {PUBLIC_APPLICATION_NAME}</title>
  {/if}
</svelte:head>

<AppBar>
  {#snippet lead()}
    <span>Create area</span>
    {#if parent != null}
      <span>in</span>
      <a class="anchor" href={basePath}>{parent.name}</a>
    {/if}
  {/snippet}
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" {...createArea.enhance(enhanceForm(state))}>
  <AreaFormFields parentFk={parent?.id} regionFk={parent?.regionFk} />

  <div class="mt-8 flex justify-between md:items-center">
    <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">Cancel</button>
    <button class="btn preset-filled-primary-500" type="submit" disabled={state.loading}>
      {#if state.loading}
        <span class="me-2">
          <ProgressRing size="size-4" value={null} />
        </span>
      {:else}
        <i class="fa-solid fa-floppy-disk"></i>
      {/if}

      Save area
    </button>
  </div>
</form>
