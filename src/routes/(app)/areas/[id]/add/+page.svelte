<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Breadcrumb from '$lib/components/Breadcrumb/Breadcrumb.svelte'
  import MarkdownEditor from '$lib/components/MarkdownEditor/MarkdownEditor.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { createArea } from '$lib/entities/area/areas.remote'
  import { canAddArea } from '$lib/entities/area/permissions'
  import { areaDetail } from '$lib/entities/area/resources.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'

  const global = getGlobalState()

  // Live reference to the parent area: its name anchors the prompt and its
  // region/type decide whether a sub-area may be added beneath it at all.
  const parent = areaDetail(() => Number(page.params.id))

  let name = $state('')
  let description = $state('')
  let errored = $state(false)

  const trimmedName = $derived(name.trim())
  const canSubmit = $derived(trimmedName.length > 0 && createArea.pending === 0)

  const create = async (parentFk: number) => {
    if (!canSubmit) {
      return
    }

    errored = false

    try {
      const trimmedDescription = description.trim()
      const area = await createArea({
        name: trimmedName,
        parentFk,
        description: trimmedDescription.length > 0 ? trimmedDescription : undefined,
      })
      // Land straight in the freshly-created area, the shared destination.
      await goto(resolve('/(app)/(shell)/(map)/areas/[id]', { id: String(area.id) }))
    } catch {
      errored = true
    }
  }
</script>

<svelte:head>
  <title>{m.areas_addArea()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<QueryState resource={parent}>
  {#snippet ready(area)}
    {#if canAddArea(global.userRegions, area)}
      <form
        class="mx-auto flex min-h-full w-full max-w-screen-sm flex-col"
        onsubmit={(event) => {
          event.preventDefault()
          create(area.id)
        }}
      >
        <!-- Header: Cancel · New area · Create -->
        <header
          class="border-surface-200-800 bg-surface-50-950/90 sticky top-0 z-10 flex items-center justify-between gap-3 border-b px-4 py-3 backdrop-blur"
        >
          <a
            class="text-surface-600-400 hover:text-surface-900-100 text-sm font-semibold transition-colors"
            href={resolve('/(app)/(shell)/(map)/areas/[id]', { id: String(area.id) })}
          >
            {m.common_cancel()}
          </a>

          <span class="text-sm font-bold">{m.areas_newArea()}</span>

          <button
            class="text-primary-600-400 text-sm font-bold transition-opacity disabled:opacity-40"
            disabled={!canSubmit}
            type="submit"
          >
            {m.areas_createArea()}
          </button>
        </header>

        <div class="flex flex-col gap-7 px-4 py-6">
          <!-- Parent location trail: where the new sub-area will live. -->
          <Breadcrumb {area} includeSelf userRegions={global.userRegions} />

          <!-- Area name -->
          <div class="space-y-2">
            <label class="text-surface-700-300 text-sm font-semibold" for="area-name">
              {m.areas_namePlaceholder()}
            </label>
            <!-- Focusing the name on mount (raising the keyboard immediately) keeps
                 the fast naming flow this screen was built around. -->
            <input
              {@attach (node) => node.focus()}
              id="area-name"
              class="border-surface-300-700 bg-surface-100-900 focus:border-primary-500 w-full rounded-xl border px-4 py-3 text-base font-semibold tracking-tight focus:ring-0 focus:outline-none"
              autocapitalize="words"
              autocomplete="off"
              bind:value={name}
              enterkeyhint="next"
              name="name"
              placeholder={m.areas_namePlaceholder()}
              type="text"
            />
            <p class="text-surface-600-400 text-sm leading-relaxed">{m.areas_nameHint()}</p>
          </div>

          <!-- Description -->
          <div class="space-y-2">
            <label class="text-surface-700-300 text-sm font-semibold" for="area-description">
              {m.editor_descriptionLabel()}
            </label>
            <MarkdownEditor bind:value={description} placeholder={m.editor_placeholder()} regionFk={area.regionFk} />
            <p class="text-surface-600-400 text-sm leading-relaxed">{m.editor_descriptionHint()}</p>
          </div>

          {#if errored}
            <p class="text-error-500 text-sm">{m.areas_createAreaError()}</p>
          {/if}
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
