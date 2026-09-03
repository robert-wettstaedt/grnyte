<script lang="ts">
  import Breadcrumb from '$lib/components/Breadcrumb/Breadcrumb.svelte'
  import MarkdownEditor from '$lib/components/MarkdownEditor/MarkdownEditor.svelte'
  import type { AreaDetail } from '$lib/entities/area/dto'
  import RemoteFormInputWrapper from '$lib/forms/RemoteFormInputWrapper.svelte'
  import type { MapData } from '$lib/map/types'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import type { RemoteForm } from '@sveltejs/kit'
  import BlockLocationField from './BlockLocationField.svelte'
  import type { BlockFormInput } from './blocks.remote'

  type Coords = { lat: number; long: number }

  // Shared body for the add/edit block forms: location breadcrumb, optional name, and the
  // recommended location field. The surrounding chrome (header, submit) lives in `Form`;
  // location state + actions are owned by the parent (`BlockForm`). Mirrors AreaFormFields.
  interface Props {
    /** The crag the block belongs to. */
    area: AreaDetail
    /** The pin is a rough guess ("?" on the map), not a confirmed spot. */
    estimated: boolean
    form: RemoteForm<BlockFormInput, unknown>
    locating: boolean
    location: Coords | null
    mapData: MapData
    onEstimatedChange: (estimated: boolean) => void
    onPickLocation: () => void
    onRemove: () => void
    onUseCurrentLocation: () => void
  }

  const {
    area,
    estimated,
    form,
    locating,
    location,
    mapData,
    onEstimatedChange,
    onPickLocation,
    onRemove,
    onUseCurrentLocation,
  }: Props = $props()

  const global = getGlobalState()
</script>

<!-- Submitted values not typed directly: the area and the picked location. -->
<input name="areaId" type="hidden" value={area.id} />
<input name="lat" type="hidden" value={location?.lat ?? ''} />
<input name="long" type="hidden" value={location?.long ?? ''} />
<input name="estimated" type="hidden" value={location != null && estimated ? 'true' : ''} />

<!-- Present only when editing: the create form leaves `id` unset. -->
{#if form.fields.id.value() != null}
  <input type="hidden" {...form.fields.id.as('text')} />
{/if}

<Breadcrumb {area} includeSelf userRegions={global.userRegions} />

<RemoteFormInputWrapper
  class="space-y-2.5"
  field={form.fields.name}
  hint={m.blocks_add_nameHint()}
  id="block-name"
  label={m.blocks_add_nameLabel()}
>
  {#snippet children(props)}
    <input
      {...form.fields.name.as('text')}
      {...props}
      autocapitalize="words"
      autocomplete="off"
      class="border-surface-300-700 bg-surface-100-900 focus:border-primary-500 w-full rounded-xl border px-4 py-3.5 text-base font-semibold tracking-tight focus:ring-0 focus:outline-none"
      enterkeyhint="done"
      placeholder={m.blocks_add_namePlaceholder()}
    />
  {/snippet}
</RemoteFormInputWrapper>

<BlockLocationField
  {location}
  {mapData}
  {locating}
  {estimated}
  {onUseCurrentLocation}
  {onPickLocation}
  {onRemove}
  {onEstimatedChange}
/>

<!-- `regionFk` scopes the entity-reference picker. A block always hangs off a crag, so it comes
     straight off the area rather than through AreaFormFields' top-level-area fallback. -->
<RemoteFormInputWrapper
  class="space-y-2.5"
  field={form.fields.description}
  hint={m.editor_descriptionHint()}
  id="block-description"
  label={m.editor_descriptionLabel()}
>
  {#snippet children(props)}
    <MarkdownEditor
      {...form.fields.description.as('text')}
      {...props}
      placeholder={m.editor_placeholder()}
      regionFk={area.regionFk}
    />
  {/snippet}
</RemoteFormInputWrapper>
