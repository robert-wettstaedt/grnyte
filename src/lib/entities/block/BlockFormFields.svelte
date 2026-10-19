<script lang="ts">
  import Breadcrumb from '$lib/components/Breadcrumb/Breadcrumb.svelte'
  import MarkdownEditor from '$lib/components/MarkdownEditor/MarkdownEditor.svelte'
  import type { AreaDetail } from '$lib/entities/area/dto'
  import EditKeys from '$lib/forms/EditKeys.svelte'
  import FieldWrapper from '$lib/forms/FieldWrapper.svelte'
  import type { FormStore } from '$lib/forms/store.svelte'
  import type { MapData } from '$lib/map/types'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import BlockLocationField from './BlockLocationField.svelte'
  import type { BlockFormInput } from './dto'

  type Coords = { lat: number; long: number }

  // Shared body for the add/edit block forms: location breadcrumb, optional name, and the
  // recommended location field. The surrounding chrome (header, submit) lives in `Form`;
  // location state + actions are owned by the parent (`BlockForm`). Mirrors AreaFormFields.
  interface Props {
    /** The sector the block belongs to. */
    area: AreaDetail
    /** The pin is a rough guess ("?" on the map), not a confirmed spot. */
    estimated: boolean
    form: FormStore<BlockFormInput, unknown>
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

<input {...form.fields.areaId.as('hidden')} />
<input {...form.fields.lat.as('hidden')} />
<input {...form.fields.long.as('hidden')} />
<input {...form.fields.estimated.as('hidden')} />

<EditKeys id={form.fields.id} known={form.fields.known} />

<Breadcrumb {area} includeSelf userRegions={global.userRegions} />

<FieldWrapper
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
</FieldWrapper>

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

<!-- `regionFk` scopes the entity-reference picker. A block always hangs off a sector, so it comes
     straight off the area rather than through AreaFormFields' top-level-area fallback. -->
<FieldWrapper
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
</FieldWrapper>
