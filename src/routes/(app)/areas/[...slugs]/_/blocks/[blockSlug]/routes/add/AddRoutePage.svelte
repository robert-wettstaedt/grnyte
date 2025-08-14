<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'
  import FormActionBar from '$lib/components/FormActionBar'
  import RouteFormFields from '$lib/components/RouteFormFields'
  import type { Row } from '$lib/db/zero'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import { createRoute, createRouteAndReload } from './page.remote'

  interface Props {
    block: Row<'blocks'>
  }

  let { block }: Props = $props()
  let basePath = $derived(`/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}`)
  const pending = $derived(createRoute.pending + createRouteAndReload.pending)
</script>

<svelte:head>
  <title>Create route in {block.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    <span>Create route in</span>
    <a class="anchor" href={basePath}>{block.name}</a>
  {/snippet}
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" {...createRoute.enhance(enhanceForm())}>
  <RouteFormFields blockId={block.id} description={''} gradeFk={null} name={''} rating={null} routeTags={[]} />

  <input type="hidden" name="redirect" value={page.url.searchParams.get('redirect') ?? ''} />

  <FormActionBar label="Save route" {pending}>
    {#snippet buttons()}
      <button
        class="btn preset-outlined-primary-500"
        disabled={pending > 0}
        {...createRouteAndReload.buttonProps.enhance(enhanceForm())}
      >
        {#if pending > 0}
          <span class="me-2">
            <ProgressRing size="size-4" value={null} />
          </span>
        {/if}
        Save and create another
      </button>
    {/snippet}
  </FormActionBar>
</form>
