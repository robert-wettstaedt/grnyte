<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { createArea } from '$lib/entities/area/areas.remote'
  import { canAddArea } from '$lib/entities/area/permissions'
  import { areaDetail } from '$lib/entities/area/resources.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'

  const app = getGlobalState()

  // Live reference to the parent area: its name anchors the prompt and its
  // region/type decide whether a sub-area may be added beneath it at all.
  const parent = areaDetail(() => Number(page.params.id))

  let name = $state('')
  let errored = $state(false)

  const trimmedName = $derived(name.trim())
  const canSubmit = $derived(trimmedName.length > 0 && createArea.pending === 0)

  const create = async (parentFk: number) => {
    if (!canSubmit) {
      return
    }

    errored = false

    try {
      const area = await createArea({ name: trimmedName, parentFk })
      // Land straight in the freshly-created area, the shared destination.
      await goto(resolve('/(app)/(map)/areas/[id]', { id: String(area.id) }))
    } catch {
      errored = true
    }
  }
</script>

<QueryState resource={parent}>
  {#snippet ready(area)}
    {#if canAddArea(app.userRegions, area)}
      <form
        class="mx-auto flex min-h-full w-full max-w-screen-sm flex-col px-6 pt-6 pb-8"
        onsubmit={(event) => {
          event.preventDefault()
          create(area.id)
        }}
      >
        <div>
          <a
            class="text-surface-600-400 hover:text-surface-900-100 text-sm font-semibold transition-colors"
            href={resolve('/(app)/(map)/areas/[id]', { id: String(area.id) })}
          >
            {m.common_cancel()}
          </a>
        </div>

        <div class="mt-12 md:mt-20">
          <p class="text-surface-500 mb-4 text-xs font-bold tracking-[0.09em] uppercase">
            {m.areas_newArea()} · {area.name}
          </p>

          <h1 class="mb-8 text-[1.7rem] leading-tight font-bold tracking-tight text-balance">
            {m.areas_nameQuestion()}
          </h1>

          <!-- Focusing the one field on mount (raising the keyboard immediately) is the
               whole point of this single-purpose naming screen. -->
          <input
            {@attach (node) => node.focus()}
            class="border-primary-500 placeholder:text-surface-500 w-full border-0 border-b-2 bg-transparent pb-3 text-[1.75rem] font-semibold tracking-tight focus:ring-0 focus:outline-none"
            autocapitalize="words"
            autocomplete="off"
            bind:value={name}
            enterkeyhint="done"
            name="name"
            placeholder={m.areas_namePlaceholder()}
            type="text"
          />

          <p class="text-surface-600-400 mt-4 text-sm leading-relaxed">{m.areas_nameHint()}</p>

          {#if errored}
            <p class="text-error-500 mt-3 text-sm">{m.areas_createAreaError()}</p>
          {/if}
        </div>

        <div class="mt-auto pt-8">
          <button
            class="btn preset-filled-primary-500 w-full gap-2 py-3.5 text-base font-bold"
            disabled={!canSubmit}
            type="submit"
          >
            {m.areas_createArea()}
            <Icon name="arrow-right" size={19} />
          </button>
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
