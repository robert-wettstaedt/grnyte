<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import RouteExternalResourceLinks from '$lib/components/RouteExternalResourceLinks'
  import RouteName from '$lib/components/RouteName/RouteNameLoader.svelte'
  import type { ZeroQueryResult } from '$lib/components/ZeroQueryWrapper'
  import { getAreaContext } from '$lib/contexts/area'
  import type { RowWithRelations } from '$lib/db/zero'
  import { convertException } from '$lib/errors'
  import { AppBar, Progress } from '@skeletonlabs/skeleton-svelte'
  import type { PageProps } from './$types'

  interface Props {
    routes: ZeroQueryResult<PageProps['data']['query']>
  }

  let { routes }: Props = $props()
  const { area } = getAreaContext()

  let basePath = $derived(`/areas/${page.params.slugs}`)

  let error: string | null = $state(null)
  let loading = $state(false)
  let values:
    | RowWithRelations<
        'routeExternalResources',
        { externalResource8a: true; externalResource27crags: true; externalResourceTheCrag: true }
      >[]
    | undefined = $state(undefined)

  const blocks = $derived.by(() => {
    const map = new Map(routes.map((route) => [route.block?.id, route.block]))
    const blocks = Array.from(map.values()).filter((b) => b != null)
    return blocks.map((block) => {
      const blockRoutes = routes.filter((route) => route.block?.id === block.id)
      return { ...block, routes: blockRoutes }
    })
  })

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
  <title>Sync external resources of {area.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>
      Sync external resources of
      <a class="anchor" href={basePath}>{area.name}</a>
    </AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

{#if error != null}
  <aside class="alert variant-filled-error mt-8">
    <div class="alert-message">
      <p>{error}</p>
    </div>
  </aside>
{/if}

<div class="text-token card preset-filled-surface-100-900 mt-8 w-full space-y-4 overflow-auto p-2 md:p-4">
  {#each blocks as block}
    <p class="font-bold">{block.name}</p>

    <ul>
      {#each block.routes as route}
        <li class="hover:bg-surface-400 flex items-center justify-between p-1 whitespace-nowrap">
          <RouteName {route} />

          {#if loading && values?.find((value) => value.routeFk === route.id) == null}
            <Progress value={null}>
              <Progress.Circle class="[--size:--spacing(4)]">
                <Progress.CircleTrack />
                <Progress.CircleRange />
              </Progress.Circle>
              <Progress.ValueText />
            </Progress>
          {:else}
            <RouteExternalResourceLinks
              iconSize={16}
              routeExternalResources={values?.find((value) => value.routeFk === route.id) ??
                (route.externalResources as RowWithRelations<
                  'routeExternalResources',
                  { externalResource8a: true; externalResource27crags: true; externalResourceTheCrag: true }
                >)}
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
        <Progress value={null}>
          <Progress.Circle class="[--size:--spacing(4)]">
            <Progress.CircleTrack />
            <Progress.CircleRange />
          </Progress.Circle>
          <Progress.ValueText />
        </Progress>
      </span>
    {/if}

    Sync external resources
  </button>
</div>
