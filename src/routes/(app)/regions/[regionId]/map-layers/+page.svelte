<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { entityHref } from '$lib/entities/href'
  import { regionAdminScreen } from '$lib/entities/region/adminScreen.svelte'
  import { regionMapLayersSchema } from '$lib/entities/region/dto'
  import { mapLayersFingerprint, toLayerForm } from '$lib/entities/region/settings'
  import { updateRegionMapLayers } from '$lib/entities/region/writes'
  import { fieldRows } from '$lib/forms/fieldRows.svelte'
  import Form from '$lib/forms/Form.svelte'
  import RemoteFormInputWrapper from '$lib/forms/RemoteFormInputWrapper.svelte'
  import { seedOnKeyChange } from '$lib/forms/seed.svelte'
  import { createFormStore } from '$lib/forms/store.svelte'
  import { m } from '$lib/paraglide/messages'
  import { toaster } from '$lib/state/toast'
  import RegionAdminRequired from '../RegionAdminRequired.svelte'
  import RegionScreen from '../RegionScreen.svelte'

  const screen = regionAdminScreen()
  const store = createFormStore(regionMapLayersSchema)
  const fields = store.fields

  // From the memberships the shell already has. No async load, so `Form` stays the route's direct
  // child: a wrapper between them breaks its sticky header.
  // Separate from `stored`: an unsynced membership and a region with no layers both give `[]`.
  const stored = $derived(screen.membership?.settings.mapLayers ?? [])

  // Only the row identities live here, the values live in the form. `fields.set` replaces the whole
  // input, so a re-seed has to carry the id along with the rows.
  const rows = fieldRows({
    blank: { attributions: '', minZoom: '', name: '', opacity: '', url: '' },
    read: () => fields.mapLayers.value() ?? [],
    // `known` describes what was LOADED, not what is on screen: recomputing it proves nothing.
    write: (mapLayers) => fields.set({ id: String(screen.regionId), known: fields.known.value() ?? '', mapLayers }),
  })

  // Keyed on `synced`, not the id: a membership can arrive without its region row, and seeding
  // then submits an empty list, which the handler reads as "remove them all".
  // `layersComplete` too: a half-read blob holds fewer layers than are stored.
  seedOnKeyChange(
    () => (screen.membership?.synced === true && screen.membership.layersComplete ? screen.regionId : undefined),
    () => {
      fields.set({
        id: String(screen.regionId),
        known: mapLayersFingerprint(stored),
        mapLayers: stored.map(toLayerForm),
      })
      rows.reset(stored.length)
    },
  )

  const onSubmitted = () => {
    toaster.create({ title: m.common_saved(), type: 'success' })
  }
</script>

<svelte:head>
  <title>{m.region_mapLayers()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if !screen.isAdmin}
  <RegionScreen backTo={entityHref('regions', screen.regionId)} title={m.region_mapLayers()}>
    <RegionAdminRequired regionId={screen.regionId} />
  </RegionScreen>
{:else if screen.membership?.synced !== true}
  <!-- No form until the region row is here. Rendering one meanwhile is what made this screen
       destructive four rounds running: an empty list is a valid submission that means "remove them
       all", so a form that renders before its data has arrived is a delete button with a Save label. -->
  <RegionScreen backTo={entityHref('regions', screen.regionId)} title={m.region_mapLayers()} />
{:else if !screen.membership.layersComplete}
  <!-- Refused rather than rendered: the form can only submit the layers it could read, so saving it
       would silently drop the ones it could not, and this screen is the only copy of them. -->
  <RegionScreen backTo={entityHref('regions', screen.regionId)} title={m.region_mapLayers()}>
    <ErrorState
      type="generic"
      title={m.region_mapLayersUnreadableTitle()}
      description={m.region_mapLayersUnreadableBody()}
    />
  </RegionScreen>
{:else}
  <Form
    {store}
    submit={updateRegionMapLayers}
    cancelTo={entityHref('regions', screen.regionId)}
    {onSubmitted}
    submitLabel={m.common_save()}
    title={m.region_mapLayers()}
  >
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
