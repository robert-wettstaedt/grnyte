<script lang="ts">
  import { applyAction, enhance } from '$app/forms'
  import { invalidate } from '$app/navigation'
  import { page } from '$app/stores'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'
  import RouteName from '$lib/components/RouteName'
  import TopoViewer, { selectedRouteStore } from '$lib/components/TopoViewer'
  import { type TopoDTO } from '$lib/topo'
  import '@fortawesome/fontawesome-free/css/all.css'
  import { Popover, ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import { onMount } from 'svelte'
  import type { ChangeEventHandler } from 'svelte/elements'
  import '../../../../../../../../app.postcss'

  let { form, data } = $props()

  interface UndoHistory {
    topos: TopoDTO[]
    selectedRouteStore: number | null
    selectedTopoIndex: number
  }

  // https://github.com/sveltejs/kit/issues/12999
  let topos = $state(data.topos)
  $effect(() => {
    topos = data.topos
  })
  let undoHistory = $state<UndoHistory[]>([
    $state.snapshot({
      topos: data.topos,
      selectedRouteStore: null,
      selectedTopoIndex: 0,
    }),
  ])
  $effect(() => {
    undoHistory = [
      $state.snapshot({
        topos: data.topos,
        selectedRouteStore: null,
        selectedTopoIndex: 0,
      }),
    ]
  })

  let basePath = $derived(`/areas/${$page.params.slugs}/_/blocks/${$page.params.blockSlug}`)

  let selectedTopoIndex = $state(0)

  let isAdding = $state(false)
  let isDeleting = $state(false)
  let isSaving = $state(false)

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

  // TODO
  onMount(() => {
    selectedRouteStore.set(null)

    const beforeUnload = () => {
      if (undoHistory.length <= 1) {
        return undefined
      }

      return `It looks like you have been editing something. If you leave before saving, your changes will be lost.`
    }

    window.addEventListener('beforeunload', beforeUnload)

    return () => {
      // window.removeEventListener('beforeunload', beforeUnload)
    }
  })
</script>

<svelte:head>
  <title>Draw topo of {data.block.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<div class="fixed top-0 left-0 w-screen h-screen -z-10 preset-filled-surface-100-900"></div>

<div class="flex justify-between m-2 md:m-4">
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
      class="btn-icon preset-outlined-primary-500"
      disabled={undoHistory.length <= 1}
      onclick={onUndo}
    >
      <i class="fa-solid fa-undo"></i>
    </button>
  </div>
  <div class="flex gap-2">
    <Popover
      arrow
      arrowBackground="!bg-surface-200 dark:!bg-surface-800"
      contentBase="card bg-surface-200-800 p-4 space-y-4 max-w-[320px] shadow-lg"
      positionerZIndex="!z-50"
      positioning={{ placement: 'bottom-end' }}
      triggerBase="btn-icon preset-outlined-surface-500"
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
                <i class="fa-solid fa-cloud-arrow-up w-5 me-2"></i>Upload topo image
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
                  <i class="fa-solid fa-trash w-5 me-2"></i>Remove topo image
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
                        selectedTopoIndex = 0
                        $selectedRouteStore = null
                        invalidate($page.url)

                        return async ({ update, result }) => {
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

            <li
              class="hover:preset-tonal-primary flex flex-wrap justify-between whitespace-nowrap border-b-[1px] last:border-none border-surface-800 rounded"
            >
              <a class="p-2 md:p-4" href="{basePath}/routes/add">
                <i class="fa-solid fa-plus w-5 me-2"></i>Create new route
              </a>
            </li>
          </ul>
        </nav>
      {/snippet}
    </Popover>

    <a aria-label="Close" class="btn-icon preset-outlined-surface-500" href={basePath}>
      <i class="fa-solid fa-x"></i>
    </a>
  </div>
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
