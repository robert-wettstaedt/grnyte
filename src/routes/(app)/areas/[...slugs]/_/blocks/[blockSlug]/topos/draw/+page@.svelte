<script lang="ts">
  import { applyAction, enhance } from '$app/forms'
  import { beforeNavigate, invalidate } from '$app/navigation'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'
  import RouteName from '$lib/components/RouteName'
  import TopoViewer, { selectedRouteStore } from '$lib/components/TopoViewer'
  import { type TopoDTO } from '$lib/topo'
  import '@fortawesome/fontawesome-free/css/all.css'
  import { Popover, ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import 'github-markdown-css/github-markdown-dark.css'
  import { onMount } from 'svelte'
  import type { ChangeEventHandler } from 'svelte/elements'
  import '../../../../../../../../../app.css'

  let { form, data } = $props()

  interface UndoHistory {
    topos: TopoDTO[]
    selectedRouteStore: number | null
    selectedTopoIndex: number
  }

  const getNewHistoryEntry = () => {
    return {
      topos: $state.snapshot(data.topos),
      selectedRouteStore: null,
      selectedTopoIndex: 0,
    }
  }

  // https://github.com/sveltejs/kit/issues/12999
  let topos = $state(data.topos)
  $effect(() => {
    topos = data.topos
  })
  let undoHistory = $state<UndoHistory[]>([getNewHistoryEntry()])
  $effect(() => {
    undoHistory = [getNewHistoryEntry()]
  })

  let basePath = $derived(`/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}`)

  let isSaving = $state(false)

  let selectedTopoIndex = $state(0)
  let selectedRoute = $derived(topos[selectedTopoIndex].routes.find((route) => route.routeFk === $selectedRouteStore))

  const onChangeTopo = (value: TopoDTO[]) => {
    const lastItem = undoHistory.at(-1)

    if (lastItem != null) {
      lastItem.selectedRouteStore = $selectedRouteStore
      lastItem.selectedTopoIndex = selectedTopoIndex
    }

    undoHistory = [
      ...undoHistory,
      {
        topos: $state.snapshot(value),
        selectedRouteStore: null,
        selectedTopoIndex: 0,
      },
    ]
  }

  const onChangeSelect: ChangeEventHandler<HTMLSelectElement> = (event) => {
    selectedRouteStore.set(Number(event.currentTarget.value))
  }

  const onUndo = () => {
    const lastItem = undoHistory.at(-2)
    if (lastItem != null) {
      const timeout = selectedTopoIndex === lastItem.selectedTopoIndex ? 0 : 400

      selectedTopoIndex = lastItem.selectedTopoIndex
      setTimeout(() => {
        topos = lastItem.topos
        selectedRouteStore.set(lastItem.selectedRouteStore)
      }, timeout)

      undoHistory = undoHistory.slice(0, -1)
    }
  }

  function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout> | undefined

    return (...args: Parameters<T>) => {
      clearTimeout(timeout)
      timeout = setTimeout(() => func(...args), wait)
    }
  }

  onMount(() => {
    selectedRouteStore.set(null)

    beforeNavigate(({ cancel }) => {
      if (undoHistory.length <= 1) {
        return
      }

      if (!window.confirm('You have unsaved changes. Are you sure you want to leave?')) {
        cancel()
      }
    })
  })
</script>

<svelte:head>
  <title>Draw topo of {data.block.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<div class="preset-filled-surface-100-900 fixed top-0 left-0 -z-10 h-screen w-screen"></div>

<div class="m-2 flex justify-between md:m-4">
  <a aria-label="Close" class="btn-icon bg-white/20 text-xl backdrop-blur-sm" href={basePath}>
    <i class="fa-solid fa-arrow-left"></i>
  </a>

  <div class="flex gap-2">
    <form
      method="POST"
      action="?/saveTopos"
      use:enhance={() => {
        isSaving = true

        return async ({ update }) => {
          isSaving = false

          return update()
        }
      }}
    >
      <button
        aria-label="Save"
        class="btn-icon preset-filled-primary-500"
        disabled={isSaving || undoHistory.length <= 1}
      >
        {#if isSaving}
          <ProgressRing size="size-4" value={null} />
        {:else}
          <i class="fa-solid fa-floppy-disk"></i>
        {/if}
      </button>

      <input type="hidden" name="topos" value={JSON.stringify(topos)} />
    </form>

    <button
      aria-label="Undo"
      class="btn-icon bg-white/20 backdrop-blur-sm"
      disabled={undoHistory.length <= 1}
      onclick={onUndo}
    >
      <i class="fa-solid fa-undo"></i>
    </button>

    <Popover
      arrow
      arrowBackground="!bg-surface-200 dark:!bg-surface-800"
      contentBase="card bg-surface-200-800 p-4 space-y-4 max-w-[320px] shadow-lg"
      zIndex="50"
      positioning={{ placement: 'bottom' }}
      triggerBase="btn-icon bg-white/20 backdrop-blur-sm"
    >
      {#snippet trigger()}
        <i class="fa-solid fa-ellipsis-vertical"></i>
      {/snippet}

      {#snippet content()}
        <nav class="list-nav w-48">
          <ul>
            <Popover
              arrow
              arrowBackground="!bg-surface-300 dark:!bg-surface-700"
              contentBase="card bg-surface-300-700 p-4 space-y-4 max-w-[320px] shadow-lg"
              zIndex="50"
              positioning={{ placement: 'bottom' }}
              triggerClasses="hover:preset-tonal-primary flex flex-wrap justify-between items-center whitespace-nowrap border-b-[1px] last:border-none border-surface-800 rounded w-full p-2 md:p-4"
            >
              {#snippet trigger()}
                Topo <i class="fa-solid fa-chevron-down"></i>
              {/snippet}

              {#snippet content()}
                <nav class="list-nav w-48">
                  <ul>
                    <li
                      class="hover:preset-tonal-primary border-surface-800 flex flex-wrap justify-between rounded border-b-[1px] whitespace-nowrap last:border-none"
                    >
                      <a class="w-full p-2 md:p-4" href="{basePath}/topos/add?redirect={basePath}/topos/draw">
                        <i class="fa-solid fa-cloud-arrow-up me-2 w-5"></i>Upload
                      </a>
                    </li>

                    <li
                      class="hover:preset-tonal-primary border-surface-800 flex flex-wrap justify-between rounded border-b-[1px] whitespace-nowrap last:border-none"
                    >
                      <a
                        class="w-full p-2 md:p-4"
                        href="{basePath}/topos/{topos[selectedTopoIndex].id}/edit?redirect={basePath}/topos/draw"
                      >
                        <i class="fa-solid fa-retweet me-2 w-5"></i>Replace
                      </a>
                    </li>

                    <li
                      class="hover:preset-tonal-primary border-surface-800 flex flex-wrap justify-between rounded border-b-[1px] whitespace-nowrap last:border-none"
                    >
                      <Popover
                        arrow
                        arrowBackground="!bg-surface-400 dark:!bg-surface-600"
                        contentBase="card bg-surface-400-600 p-4 space-y-4 max-w-[320px]"
                        positioning={{ placement: 'bottom' }}
                        zIndex="50"
                        triggerClasses="p-2 md:p-4 w-full text-left {isSaving ? 'pointer-events-none opacity-50' : ''}"
                        classes="w-full"
                      >
                        {#snippet trigger()}
                          <i class="fa-solid fa-trash me-2 w-5"></i>Remove
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
                                isSaving = true
                                selectedTopoIndex = 0
                                $selectedRouteStore = null
                                invalidate(page.url)

                                return async ({ update, result }) => {
                                  isSaving = false
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

            <Popover
              arrow
              arrowBackground="!bg-surface-300 dark:!bg-surface-700"
              contentBase="card bg-surface-300-700 p-4 space-y-4 max-w-[320px] shadow-lg"
              zIndex="50"
              positioning={{ placement: 'bottom' }}
              triggerClasses="hover:preset-tonal-primary flex flex-wrap justify-between items-center whitespace-nowrap border-b-[1px] last:border-none border-surface-800 rounded w-full p-2 md:p-4"
            >
              {#snippet trigger()}
                Route <i class="fa-solid fa-chevron-down"></i>
              {/snippet}

              {#snippet content()}
                <nav class="list-nav w-48">
                  <ul>
                    <li
                      class="hover:preset-tonal-primary border-surface-800 flex flex-wrap justify-between rounded border-b-[1px] whitespace-nowrap last:border-none"
                    >
                      <a class="w-full p-2 md:p-4" href="{basePath}/routes/add?redirect={basePath}/topos/draw">
                        <i class="fa-solid fa-plus me-2 w-5"></i>New
                      </a>
                    </li>

                    <li
                      class="hover:preset-tonal-primary border-surface-800 flex flex-wrap justify-between rounded border-b-[1px] whitespace-nowrap last:border-none"
                    >
                      <a
                        class="w-full p-2 md:p-4 {selectedRoute == null ? 'pointer-events-none opacity-50' : ''}"
                        aria-disabled={selectedRoute == null}
                        href={selectedRoute == null ? '' : `${basePath}/routes/${selectedRoute.routeFk}`}
                      >
                        <i class="fa-solid fa-eye me-2 w-5"></i>Show
                      </a>
                    </li>

                    <li
                      class="hover:preset-tonal-primary border-surface-800 flex flex-wrap justify-between rounded border-b-[1px] whitespace-nowrap last:border-none"
                    >
                      <a
                        class="w-full p-2 md:p-4 {selectedRoute == null ? 'pointer-events-none opacity-50' : ''}"
                        aria-disabled={selectedRoute == null}
                        href={selectedRoute == null
                          ? ''
                          : `${basePath}/routes/${selectedRoute.routeFk}/edit?redirect=${basePath}/topos/draw`}
                      >
                        <i class="fa-solid fa-pen me-2 w-5"></i>Edit
                      </a>
                    </li>

                    <li
                      class="hover:preset-tonal-primary border-surface-800 flex flex-wrap justify-between rounded border-b-[1px] whitespace-nowrap last:border-none"
                    >
                      <Popover
                        arrow
                        arrowBackground="!bg-surface-400 dark:!bg-surface-600"
                        contentBase="card bg-surface-400-600 p-4 space-y-4 max-w-[320px]"
                        positioning={{ placement: 'bottom' }}
                        zIndex="50"
                        triggerClasses="p-2 md:p-4 w-full text-left {selectedRoute == null || isSaving
                          ? 'pointer-events-none opacity-50'
                          : ''}"
                        classes="w-full"
                      >
                        {#snippet trigger()}
                          <i class="fa-solid fa-trash me-2 w-5"></i>Delete
                        {/snippet}

                        {#snippet content()}
                          <article>
                            <p>Are you sure you want to delete this route?</p>
                          </article>

                          <footer class="flex justify-end">
                            <form
                              method="POST"
                              action="?/removeRoute"
                              use:enhance={() => {
                                isSaving = true
                                $selectedRouteStore = null
                                invalidate(page.url)

                                return async ({ update, result }) => {
                                  isSaving = false
                                  await update()
                                  return applyAction(result)
                                }
                              }}
                            >
                              <input hidden name="routeId" value={selectedRoute?.routeFk} />
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
          </ul>
        </nav>
      {/snippet}
    </Popover>
  </div>
</div>

{#if form?.error}
  <aside class="card preset-tonal-warning mt-8 p-2 whitespace-pre-line md:p-4">
    <p>{form.error}</p>
  </aside>
{/if}

<div class="flex flex-wrap">
  <div class="preset-filled-surface-100-900 w-full p-2">
    <div class="input-group divide-surface-200-800 grid-cols-[1fr_auto] divide-x">
      <select
        class="select"
        disabled={isSaving}
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
          <button
            aria-label="Delete route's topo"
            class="btn"
            disabled={isSaving || selectedRoute?.points.length === 0}
            onclick={() => {
              if (selectedRoute != null) {
                selectedRoute.points = []
              }

              onChangeTopo(topos)
            }}
          >
            <i class="fa-solid fa-trash"></i>
          </button>
        {/if}
      </div>
    </div>
  </div>

  <section class="w-full" use:fitHeightAction>
    <TopoViewer editable={true} bind:selectedTopoIndex bind:topos onChange={debounce(onChangeTopo, 250)} />
  </section>
</div>
