<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { convertException } from '$lib/errors'
  import AppBar from '$lib/components/AppBar'
  import RouteExternalResourceLinks from '$lib/components/RouteExternalResourceLinks'
  import RouteName from '$lib/components/RouteName'
  import type { InferResultType } from '$lib/db/types'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'

  let { data } = $props()
  let basePath = $derived(`/areas/${page.params.slugs}`)

  let error: string | null = $state(null)
  let loading = $state(false)
  let values:
    | InferResultType<
        'routeExternalResources',
        { externalResource8a: true; externalResource27crags: true; externalResourceTheCrag: true }
      >[]
    | undefined = $state(undefined)

  async function syncExternalResources() {
    try {
      values = undefined
      error = null
      loading = true
      const response = await fetch('sync-external-resources', { method: 'POST' })

      if (response.status >= 300) {
        throw new Error(`${response.status} ${response.statusText}`)
      }

      const reader = response.body?.getReader()

      while (reader != null) {
        const { done, value } = await reader.read()
        if (done) break

        try {
          const decoded = new TextDecoder().decode(value).split('\n')

          values = [
            ...(values ?? []),
            ...decoded.filter((value) => value.trim().length > 0).map((value) => JSON.parse(value)),
          ]
        } catch (exception) {
          console.error(exception)
        }
      }
    } catch (exception) {
      error = convertException(exception)
    }

    loading = false
  }
</script>

<svelte:head>
  <title>Sync external resources of {data.area.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    <span>Sync external resources of</span>
    <a class="anchor" href={basePath}>{data.area.name}</a>
  {/snippet}
</AppBar>

{#if error != null}
  <aside class="alert variant-filled-error mt-8">
    <div class="alert-message">
      <p>{error}</p>
    </div>
  </aside>
{/if}

<div class="text-token card preset-filled-surface-100-900 mt-8 w-full space-y-4 overflow-auto p-2 md:p-4">
  {#each data.blocks as block}
    <p class="font-bold">{block.name}</p>

    <ul>
      {#each block.routes as route}
        <li class="hover:bg-surface-400 flex items-center justify-between p-1 whitespace-nowrap">
          <RouteName {route} />

          {#if loading && values?.find((value) => value.routeFk === route.id) == null}
            <ProgressRing size="size-4" value={null} />
          {:else}
            <RouteExternalResourceLinks
              iconSize={16}
              routeExternalResources={values?.find((value) => value.routeFk === route.id) ??
                data.externalResources.find((externalResource) => externalResource.routeFk === route.id)}
              showNotFoundIcon
            />
          {/if}
        </li>
      {/each}
    </ul>
  {/each}
</div>

<div class="mt-8 flex justify-between md:items-center">
  <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">Cancel</button>

  <button
    class="btn preset-filled-primary-500"
    disabled={loading || values != null}
    onclick={syncExternalResources}
    type="submit"
  >
    {#if loading}
      <span class="me-2">
        <ProgressRing size="size-4" value={null} />
      </span>
    {/if}

    Sync external resources
  </button>
</div>
