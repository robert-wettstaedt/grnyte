<script lang="ts">
  import { applyAction, enhance } from '$app/forms'
  import { page } from '$app/stores'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'
  import RouteFormFields from '$lib/components/RouteFormFields'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'

  let { form, data } = $props()
  let basePath = $derived(`/areas/${$page.params.slugs}/_/blocks/${$page.params.blockSlug}`)

  let loading = $state(false)
</script>

<svelte:head>
  <title>Create route in {data.block.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    <span>Create route in</span>
    <a class="anchor" href={basePath}>{data.block.name}</a>
  {/snippet}
</AppBar>

<form
  class="card mt-8 p-2 md:p-4 preset-filled-surface-100-900"
  method="POST"
  use:enhance={() => {
    loading = true

    return async ({ action, result }) => {
      let returnValue

      if ((result.type === 'success' || result.type === 'redirect') && action.searchParams.get('create-more')) {
        window.location.href = action.pathname
      } else if (
        location.origin + location.pathname === action.origin + action.pathname ||
        result.type === 'redirect' ||
        result.type === 'error'
      ) {
        returnValue = await applyAction(result)
      }

      loading = false

      return returnValue
    }
  }}
>
  <RouteFormFields
    blockId={data.block.id}
    description={form?.description ?? ''}
    gradeFk={form?.gradeFk ?? null}
    name={form?.name ?? ''}
    rating={form?.rating ?? null}
    routeTags={form?.tags ?? []}
    tags={data.tags}
  />

  <input type="hidden" name="redirect" value={$page.url.searchParams.get('redirect') ?? ''} />

  <div class="flex justify-between mt-8">
    <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">Cancel</button>

    <div class="flex flex-col-reverse gap-8 md:flex-row md:gap-4">
      <button class="btn preset-outlined-primary-500" formaction="?create-more=true" type="submit" disabled={loading}>
        {#if loading}
          <span class="me-2">
            <ProgressRing size="size-4" value={null} />
          </span>
        {/if}
        Save and create another
      </button>

      <button class="btn preset-filled-primary-500" type="submit" disabled={loading}>
        {#if loading}
          <span class="me-2">
            <ProgressRing size="size-4" value={null} />
          </span>
        {/if}
        Save route
      </button>
    </div>
  </div>
</form>
