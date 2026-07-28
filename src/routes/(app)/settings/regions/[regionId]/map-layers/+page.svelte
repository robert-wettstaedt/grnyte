<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { canEditRegion } from '$lib/entities/region/permissions'
  import { updateRegionMapLayers } from '$lib/entities/region/regions.remote'
  import { toLayerForm } from '$lib/entities/region/settings'
  import { fieldRows } from '$lib/forms/fieldRows.svelte'
  import Form from '$lib/forms/Form.svelte'
  import RemoteFormInputWrapper from '$lib/forms/RemoteFormInputWrapper.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import { toaster } from '$lib/state/toast'

  const global = getGlobalState()
  const fields = updateRegionMapLayers.fields

  const regionId = Number(page.params.regionId)

  // Region settings are admin-only, and the link into here is too, so this only catches somebody
  // typing the URL. The server rejects them either way - this is so they find out before typing.
  const isAdmin = $derived(canEditRegion(global.userRegions, regionId))

  // Seeded once at init from the memberships the app shell already has, the same way the name page
  // reads global.userRegions. No async load, so `Form` stays the route's direct child - wrapping it
  // in a QueryState puts a flex container between it and the page and breaks its sticky header.
  const stored = global.userRegions.find((region) => region.regionFk === regionId)?.settings?.mapLayers ?? []

  fields.set({ id: String(regionId), mapLayers: stored.map(toLayerForm) })

  // Only the row identities live here, the values live in the form. `fields.set` replaces the whole
  // input, so a re-seed has to carry the id along with the rows.
  const rows = fieldRows({
    blank: { attributions: '', minZoom: '', name: '', opacity: '', url: '' },
    count: stored.length,
    read: () => fields.mapLayers.value() ?? [],
    write: (mapLayers) => fields.set({ id: String(regionId), mapLayers }),
  })

  const goBack = () => back(resolve('/(app)/settings/regions/[regionId]', { regionId: String(regionId) }))

  const onSubmitted = () => {
    toaster.create({ title: m.common_saved(), type: 'success' })
    goBack()
  }
</script>

<svelte:head>
  <title>{m.region_mapLayers()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if !isAdmin}
  <ErrorState type="notfound" title={m.region_notFound()} />
{:else}
  <Form
    form={updateRegionMapLayers}
    onCancel={goBack}
    {onSubmitted}
    submitLabel={m.common_save()}
    title={m.region_mapLayers()}
  >
    <!-- Only rendered fields are submitted, so the id needs an input of its own: seeding it via
       `fields.set` alone leaves it out of the form data. -->
    <input type="hidden" {...fields.id.as('text')} />

    {#if rows.keys.length === 0}
      <p class="text-surface-600-400 text-sm">{m.region_mapLayersEmpty()}</p>
    {/if}

    {#each rows.keys as key, index (key)}
      {@const layer = fields.mapLayers[index]}

      <div class="border-surface-200-800 space-y-5 rounded-xl border p-4">
        <div class="flex items-start justify-between gap-3">
          <h2 class="min-w-0 flex-1 truncate text-sm font-bold">
            {layer.name.value() || m.region_mapLayerName()}
          </h2>

          <button
            type="button"
            class="btn-icon preset-filled-surface-200-800 flex-none"
            aria-label={m.region_mapLayerRemove()}
            onclick={() => rows.remove(index)}
          >
            <Icon name="trash" size={16} />
          </button>
        </div>

        <RemoteFormInputWrapper field={layer.name} id="layer-{key}-name" label={m.region_mapLayerName()} required>
          {#snippet children(props)}
            <input {...layer.name.as('text')} {...props} autocomplete="off" class="input" />
          {/snippet}
        </RemoteFormInputWrapper>

        <RemoteFormInputWrapper
          field={layer.url}
          hint={m.region_mapLayerUrlHint()}
          id="layer-{key}-url"
          label={m.region_mapLayerUrl()}
          required
        >
          {#snippet children(props)}
            <input
              {...layer.url.as('text')}
              {...props}
              autocapitalize="none"
              autocomplete="off"
              autocorrect="off"
              class="input"
              inputmode="url"
              spellcheck="false"
            />
          {/snippet}
        </RemoteFormInputWrapper>

        <div class="grid gap-5 sm:grid-cols-2">
          <RemoteFormInputWrapper field={layer.opacity} id="layer-{key}-opacity" label={m.region_mapLayerOpacity()}>
            {#snippet children(props)}
              <input
                {...layer.opacity.as('text')}
                {...props}
                autocomplete="off"
                class="input"
                inputmode="decimal"
                placeholder="1"
              />
            {/snippet}
          </RemoteFormInputWrapper>

          <RemoteFormInputWrapper field={layer.minZoom} id="layer-{key}-minZoom" label={m.region_mapLayerMinZoom()}>
            {#snippet children(props)}
              <input
                {...layer.minZoom.as('text')}
                {...props}
                autocomplete="off"
                class="input"
                inputmode="numeric"
                placeholder="0"
              />
            {/snippet}
          </RemoteFormInputWrapper>
        </div>

        <RemoteFormInputWrapper
          field={layer.attributions}
          hint={m.region_mapLayerAttributionsHint()}
          id="layer-{key}-attributions"
          label={m.region_mapLayerAttributions()}
        >
          {#snippet children(props)}
            <textarea {...layer.attributions.as('text')} {...props} class="textarea" rows="3"></textarea>
          {/snippet}
        </RemoteFormInputWrapper>
      </div>
    {/each}

    <button type="button" class="btn preset-filled-surface-200-800 w-full" onclick={rows.add}>
      <Icon name="plus" size={16} />
      {m.region_mapLayerAdd()}
    </button>
  </Form>
{/if}
