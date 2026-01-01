<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import FormActionBar from '$lib/components/FormActionBar'
  import LoadingIndicator from '$lib/components/LoadingIndicator'
  import RouteFormFields from '$lib/components/RouteFormFields'
  import { getBlockContext } from '$lib/contexts/block'
  import type { Row } from '$lib/db/zero'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import { createRoute, createRouteAndReload } from './page.remote'

  interface Props {
    description: Partial<Row<'routes'>>['description']
    gradeFk: Partial<Row<'routes'>>['gradeFk']
    name: Partial<Row<'routes'>>['name']
    rating: Partial<Row<'routes'>>['rating']
    routeTags: string[] | null | undefined
  }

  let {
    description = $bindable(),
    gradeFk = $bindable(),
    name = $bindable(),
    rating = $bindable(),
    routeTags = $bindable(),
  }: Props = $props()

  const { block } = getBlockContext()

  let basePath = $derived(`/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}`)
  const pending = $derived(createRoute.pending + createRouteAndReload.pending)
</script>

<svelte:head>
  <title>Create route in {block.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>
      Create route in
      <a class="anchor" href={basePath}>{block.name}</a>
    </AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" {...createRoute.enhance(enhanceForm())}>
  <RouteFormFields blockId={block.id} bind:description bind:gradeFk bind:name bind:rating bind:routeTags />

  <input type="hidden" name="redirect" value={page.url.searchParams.get('redirect') ?? ''} />

  <FormActionBar label="Save route" {pending}>
    {#snippet buttons()}
      <button
        class="btn preset-outlined-primary-500"
        disabled={pending > 0}
        {...createRouteAndReload.buttonProps.enhance(enhanceForm())}
      >
        {#if pending > 0}
          <LoadingIndicator />
        {/if}

        Save and create another
      </button>
    {/snippet}
  </FormActionBar>
</form>
