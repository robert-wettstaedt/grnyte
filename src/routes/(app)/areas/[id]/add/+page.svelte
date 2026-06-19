<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Breadcrumb from '$lib/components/Breadcrumb/Breadcrumb.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import MarkdownEditor from '$lib/components/MarkdownEditor/MarkdownEditor.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { createArea } from '$lib/entities/area/areas.remote'
  import { canAddArea } from '$lib/entities/area/permissions'
  import { areaDetail } from '$lib/entities/area/resources.svelte'
  import RemoteFormInputWrapper from '$lib/forms/RemoteFormInputWrapper.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'

  const global = getGlobalState()
  const parent = areaDetail(() => Number(page.params.id))

  $effect(() => {
    createArea.fields.set({
      parentFk: parent.data?.id.toString(),
      regionFk: parent.data?.regionFk.toString(),
    })
  })
</script>

<svelte:head>
  <title>{m.areas_addArea()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<QueryState resource={parent}>
  {#snippet ready(area)}
    {#if canAddArea(global.userRegions, area)}
      <form {...createArea} class="mx-auto flex min-h-full w-full max-w-screen-sm flex-col">
        {#if createArea.fields.id.value() != null}
          <input type="hidden" {...createArea.fields.id.as('text')} />
        {/if}

        <!-- Header: Cancel · New area · Create -->
        <header
          class="border-surface-200-800 bg-surface-50-950/90 sticky top-0 z-10 flex items-center justify-between gap-3 border-b py-3 pr-4 backdrop-blur"
        >
          <button
            class="btn preset-tonal-surface"
            onclick={() => back(resolve('/(app)/(shell)/(map)/areas/[id]', { id: String(area.id) }))}
          >
            {m.common_cancel()}
          </button>

          <span class="text-sm font-bold">{m.areas_newArea()}</span>

          <button class="btn preset-filled-primary-500" disabled={createArea.pending > 0} type="submit">
            {#if createArea.pending > 0}
              <LoadingIndicator />
            {/if}

            {m.areas_createArea()}
          </button>
        </header>

        <div class="flex flex-col gap-7 px-4 py-6">
          <!-- Parent location trail: where the new sub-area will live. -->
          <Breadcrumb {area} includeSelf userRegions={global.userRegions} />

          <RemoteFormInputWrapper
            class="space-y-2"
            field={createArea.fields.name}
            hint={m.areas_nameHint()}
            id="area-name"
            label={m.areas_namePlaceholder()}
          >
            {#snippet children(props)}
              <input
                {...createArea.fields.name.as('text')}
                {...props}
                {@attach (node) => node.focus()}
                autocapitalize="words"
                autocomplete="off"
                class="border-surface-300-700 bg-surface-100-900 focus:border-primary-500 mb-2 w-full rounded-xl border px-4 py-3 text-base font-semibold tracking-tight focus:ring-0 focus:outline-none"
                enterkeyhint="next"
                placeholder={m.areas_namePlaceholder()}
              />
            {/snippet}
          </RemoteFormInputWrapper>

          {#if createArea.fields.parentFk.value() == null}
            <RemoteFormInputWrapper
              class="space-y-2"
              field={createArea.fields.type}
              id="area-type"
              label={m.region_title()}
            >
              {#snippet children(props)}
                <select class="select" {...createArea.fields.regionFk.as('select')} {...props}>
                  <option disabled value="">{m.region_select()}</option>
                  {#each global.userRegions as region (region.regionFk)}
                    <option
                      disabled={!canAddArea(global.userRegions, { regionFk: region.regionFk, type: 'area' })}
                      value={String(region.regionFk)}
                    >
                      {region.name}
                    </option>
                  {/each}
                </select>
              {/snippet}
            </RemoteFormInputWrapper>
          {:else}
            <input type="hidden" {...createArea.fields.parentFk.as('text')} />
            <input type="hidden" {...createArea.fields.regionFk.as('text')} />
          {/if}

          <RemoteFormInputWrapper
            class="space-y-2"
            field={createArea.fields.description}
            hint={m.editor_descriptionHint()}
            id="area-description"
            label={m.editor_descriptionLabel()}
          >
            {#snippet children(props)}
              <MarkdownEditor
                {...createArea.fields.description.as('text')}
                {...props}
                placeholder={m.editor_placeholder()}
                regionFk={area.regionFk}
              />
            {/snippet}
          </RemoteFormInputWrapper>
        </div>
      </form>
    {:else}
      <p class="text-surface-600-400 py-8 text-center">{m.area_notFound()}</p>
    {/if}
  {/snippet}

  {#snippet empty()}
    <p class="text-surface-600-400 py-8 text-center">{m.area_notFound()}</p>
  {/snippet}
</QueryState>
