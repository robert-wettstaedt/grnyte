<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'
  import AreaFormFields from '$lib/components/AreaFormFields'
  import FormActionBar from '$lib/components/FormActionBar'
  import type { ZeroQueryResult } from '$lib/components/ZeroQueryWrapper'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import type { PageProps } from './$types'
  import { createArea } from './page.remote'

  interface Props {
    parent?: ZeroQueryResult<PageProps['data']['query']>
  }

  let { parent }: Props = $props()
  let basePath = $derived(`/areas/${page.params.slugs}`)
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

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" {...createArea.enhance(enhanceForm())}>
  <AreaFormFields parentFk={parent?.id} regionFk={parent?.regionFk} />

  <FormActionBar label="Save area" pending={createArea.pending} />
</form>
