<script lang="ts">
  import { applyAction, enhance } from '$app/forms'
  import { invalidate } from '$app/navigation'
  import { page } from '$app/stores'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'
  import RouteName from '$lib/components/RouteName'
  import TopoViewer, { selectedRouteStore } from '$lib/components/TopoViewer'
  import { convertPointsToPath, type TopoDTO, type TopoRouteDTO } from '$lib/topo'
  import '@fortawesome/fontawesome-free/css/all.css'
  import { Popover, ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import type { ChangeEventHandler } from 'svelte/elements'
  import '../../../../../../../../app.postcss'

  let { form, data } = $props()

  // https://github.com/sveltejs/kit/issues/12999
  let topos = $state(data.topos)
  $effect(() => {
    topos = data.topos
  })

  let basePath = $derived(`/areas/${$page.params.slugs}/_/blocks/${$page.params.blockSlug}`)

  let dirtyRoutes: number[] = $state([])
  let selectedTopoIndex = $state(0)

  let isAdding = $state(false)
  let isDeleting = $state(false)
  let isSaving = $state(false)

  const onChangeTopo = (value: TopoDTO[], changedRoute: TopoRouteDTO) => {
    if (changedRoute.routeFk != null) {
      dirtyRoutes = Array.from(new Set([...dirtyRoutes, changedRoute.routeFk]))
    }
  }

  const onChangeSelect: ChangeEventHandler<HTMLSelectElement> = (event) => {
    selectedRouteStore.set(Number(event.currentTarget.value))
  }
</script>

<svelte:head>
  <title>Draw topo of {data.block.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<div class="fixed top-0 left-0 w-screen h-screen -z-10 preset-filled-surface-100-900"></div>

<div class="flex gap-2 justify-end m-2 md:m-4">
  <Popover
    arrow
    arrowBackground="!bg-surface-200 dark:!bg-surface-800"
    contentBase="card bg-surface-200-800 p-4 space-y-4 max-w-[320px] shadow-lg"
    positionerZIndex="!z-50"
    positioning={{ placement: 'bottom-end' }}
    triggerBase="btn preset-outlined-surface-500"
  >
    {#snippet trigger()}
      <i class="fa-solid fa-ellipsis-vertical"></i>
    {/snippet}

    {#snippet content()}
      <nav class="list-nav">
        <ul>
          <li
            class="hover:preset-tonal-primary flex flex-wrap justify-between whitespace-nowrap border-b-[1px] last:border-none border-surface-800 rounded"
          >
            <a class="p-2 md:p-4" href="{basePath}/add-topo">
              <i class="fa-solid fa-plus me-2"></i>Add image
            </a>
          </li>

          <li
            class="hover:preset-tonal-primary flex flex-wrap justify-between whitespace-nowrap border-b-[1px] last:border-none border-surface-800 rounded"
          >
            <Popover
              arrow
              arrowBackground="!bg-surface-200 dark:!bg-surface-800"
              contentBase="card bg-surface-200-800 p-4 space-y-4 max-w-[320px]"
              positioning={{ placement: 'top' }}
              positionerZIndex="!z-50"
              triggerBase="px-2 md:px-4 py-3"
            >
              {#snippet trigger()}
                <i class="fa-solid fa-trash me-2"></i>Remove image
              {/snippet}

              {#snippet content()}
                <article>
                  <p>Are you sure you want to delete this image?</p>
                </article>

                <footer class="flex justify-end">
                  <form
                    method="POST"
                    action="?/removeTopo"
                    use:enhance={() => {
                      return async ({ update, result }) => {
                        selectedTopoIndex = 0
                        $selectedRouteStore = null
                        invalidate($page.url)

                        await update()
                        return applyAction(result)
                      }
                    }}
                  >
                    <input hidden name="id" value={topos[selectedTopoIndex]?.id} />
                    <button class="btn btn-sm preset-filled-error-500 !text-white" type="submit">Yes</button>
                  </form>
                </footer>
              {/snippet}
            </Popover>
          </li>
        </ul>
      </nav>
    {/snippet}
  </Popover>

  <a aria-label="Close" class="btn preset-outlined-surface-500" href={basePath}>
    <i class="fa-solid fa-x"></i>
  </a>
</div>

{#if form?.error}
  <aside class="card preset-tonal-warning mt-8 p-2 md:p-4 whitespace-pre-line">
    <p>{form.error}</p>
  </aside>
{/if}

<div class="flex flex-wrap">
  <div class="p-2 preset-filled-surface-100-900 w-full">
    <div class="input-group divide-surface-200-800 grid-cols-[1fr_auto] divide-x">
      <select
        class="select"
        disabled={isAdding || isDeleting || isSaving}
        onchange={onChangeSelect}
        placeholder="Select route"
        value={$selectedRouteStore ?? ''}
      >
        <option disabled value="">-- Select route --</option>

        {#each data.block.routes as route}
          <option value={route.id}>
            <RouteName {route} />
          </option>
        {/each}
      </select>

      <div>
        {#if $selectedRouteStore != null}
          {#if data.block.routes.find((route) => route.id === $selectedRouteStore)?.hasTopo}
            <div></div>
            {#if dirtyRoutes.includes($selectedRouteStore)}
              <form
                method="POST"
                action="?/saveRoute"
                use:enhance={() => {
                  isSaving = true

                  return async ({ result, update }) => {
                    isSaving = false

                    if (result.type === 'success') {
                      dirtyRoutes = dirtyRoutes.filter((routeId) => routeId !== result.data?.routeFk)
                    }

                    return update()
                  }
                }}
              >
                <input hidden name="routeFk" value={$selectedRouteStore} />
                <input hidden name="topoFk" value={topos[selectedTopoIndex].id} />
                <input
                  hidden
                  name="id"
                  value={topos
                    .flatMap((topo) => topo.routes)
                    .find((topoRoute) => topoRoute.routeFk === $selectedRouteStore)?.id}
                />
                <input
                  hidden
                  name="topType"
                  value={topos
                    .flatMap((topo) => topo.routes)
                    .find((topoRoute) => topoRoute.routeFk === $selectedRouteStore)?.topType}
                />
                <input
                  hidden
                  name="path"
                  value={convertPointsToPath(
                    topos.flatMap((topo) => topo.routes).find((topoRoute) => topoRoute.routeFk === $selectedRouteStore)
                      ?.points ?? [],
                  )}
                />

                <button aria-label="Save" class="btn variant-soft-primary" disabled={isSaving} type="submit">
                  {#if isSaving}
                    <ProgressRing size="size-4" value={null} />
                  {:else}
                    <i class="fa-solid fa-floppy-disk"></i>
                  {/if}
                </button>
              </form>
            {:else}
              <Popover
                arrow
                arrowBackground="!bg-surface-200 dark:!bg-surface-800"
                contentBase="card bg-surface-200-800 p-4 space-y-4 max-w-[320px]"
                positioning={{ placement: 'top' }}
                positionerZIndex="!z-50"
                triggerBase="btn"
              >
                {#snippet trigger()}
                  {#if isDeleting}
                    <ProgressRing size="size-4" value={null} />
                  {:else}
                    <i class="fa-solid fa-trash"></i>
                  {/if}
                {/snippet}

                {#snippet content()}
                  <article>
                    <p>Are you sure you want to delete this route's topo?</p>
                  </article>

                  <footer class="flex justify-end">
                    <form
                      method="POST"
                      action="?/removeRoute"
                      use:enhance={() => {
                        isDeleting = true

                        return ({ update }) => {
                          isDeleting = false
                          return update()
                        }
                      }}
                    >
                      <input hidden name="routeFk" value={$selectedRouteStore} />
                      <input hidden name="topoFk" value={topos[selectedTopoIndex].id} />
                      <button class="btn btn-sm preset-filled-error-500 !text-white" type="submit">Yes</button>
                    </form>
                  </footer>
                {/snippet}
              </Popover>
            {/if}
          {:else}
            <form
              method="POST"
              action="?/addRoute"
              use:enhance={() => {
                isAdding = true

                return ({ update }) => {
                  isAdding = false
                  return update()
                }
              }}
            >
              <input hidden name="routeFk" value={$selectedRouteStore} />
              <input hidden name="topoFk" value={topos[selectedTopoIndex].id} />

              <button aria-label="Add topo" class="btn" disabled={isAdding} type="submit">
                {#if isAdding}
                  <ProgressRing size="size-4" value={null} />
                {:else}
                  <i class="fa-solid fa-plus"></i>
                {/if}
              </button>
            </form>
          {/if}
        {/if}
      </div>
    </div>
  </div>

  <section class="w-full" use:fitHeightAction>
    <TopoViewer editable={true} bind:selectedTopoIndex bind:topos onChange={onChangeTopo} />
  </section>
</div>
