<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import { canEditRegion } from '$lib/entities/region/permissions'
  import { updateRegionMapLayers } from '$lib/entities/region/regions.remote'
  import { mapLayersFingerprint, toLayerForm } from '$lib/entities/region/settings'
  import { fieldRows } from '$lib/forms/fieldRows.svelte'
  import Form from '$lib/forms/Form.svelte'
  import RemoteFormInputWrapper from '$lib/forms/RemoteFormInputWrapper.svelte'
  import { seedOnKeyChange } from '$lib/forms/seedOnKeyChange.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import { toaster } from '$lib/state/toast'
  import RegionAdminRequired from '../RegionAdminRequired.svelte'

  const global = getGlobalState()
  const fields = updateRegionMapLayers.fields

  // Derived, not read once: this is one route, so the page is reused between regions. Read once,
  // Save overwrote the previous region's layers under a URL naming the other.
  const regionId = $derived(Number(page.params.regionId))

  // Region settings are admin-only, and the link into here is too, so this only catches somebody
  // typing the URL. The server rejects them either way: this is so they find out before typing.
  const isAdmin = $derived(canEditRegion(global.userRegions, regionId))

  // From the memberships the shell already has. No async load, so `Form` stays the route's direct
  // child: a wrapper between them breaks its sticky header.
  // Separate from `stored`: an unsynced membership and a region with no layers both give `[]`.
  const membership = $derived(global.userRegions.find((region) => region.regionFk === regionId))
  const stored = $derived(membership?.settings.mapLayers ?? [])

  // Only the row identities live here, the values live in the form. `fields.set` replaces the whole
  // input, so a re-seed has to carry the id along with the rows.
  const rows = fieldRows({
    blank: { attributions: '', minZoom: '', name: '', opacity: '', url: '' },
    read: () => fields.mapLayers.value() ?? [],
    // `known` describes what was LOADED, not what is on screen: recomputing it proves nothing.
    write: (mapLayers) => fields.set({ id: String(regionId), known: fields.known.value() ?? '', mapLayers }),
  })

  // Keyed on `synced`, not the id: a membership can arrive without its region row, and seeding
  // then submits an empty list, which the handler reads as "remove them all".
  // `layersComplete` too: a half-read blob holds fewer layers than are stored.
  seedOnKeyChange(
    () => (membership?.synced === true && membership.layersComplete ? regionId : undefined),
    () => {
      fields.set({ id: String(regionId), known: mapLayersFingerprint(stored), mapLayers: stored.map(toLayerForm) })
      rows.reset(stored.length)
    },
  )

  const goBack = () => back(resolve('/(app)/regions/[regionId]', { regionId: String(regionId) }))

  const onSubmitted = () => {
    toaster.create({ title: m.common_saved(), type: 'success' })
    goBack()
  }
</script>

<svelte:head>
  <title>{m.region_mapLayers()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if !isAdmin}
  <RegionAdminRequired {regionId} />
{:else if membership?.synced !== true}
  <!-- No form until the region row is here. Rendering one meanwhile is what made this screen
       destructive four rounds running: an empty list is a valid submission that means "remove them
       all", so a form that renders before its data has arrived is a delete button with a Save label. -->
  <LoadingIndicator class="flex h-full w-full items-center justify-center" size={20} />
{:else if !membership.layersComplete}
  <!-- Refused rather than rendered: the form can only submit the layers it could read, so saving it
       would silently drop the ones it could not, and this screen is the only copy of them. -->
  <ErrorState
    type="generic"
    title={m.region_mapLayersUnreadableTitle()}
    description={m.region_mapLayersUnreadableBody()}
  />
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
    <input type="hidden" {...fields.known.as('text')} />

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
