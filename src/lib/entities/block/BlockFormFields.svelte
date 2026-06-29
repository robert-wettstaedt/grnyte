<script lang="ts">
  import Breadcrumb from '$lib/components/Breadcrumb/Breadcrumb.svelte'
  import type { AreaDetail } from '$lib/entities/area/dto'
  import RemoteFormInputWrapper from '$lib/forms/RemoteFormInputWrapper.svelte'
  import type { MapData } from '$lib/map/types'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import type { RemoteForm } from '@sveltejs/kit'
  import BlockLocationField from './BlockLocationField.svelte'
  import type { CreateBlockInput } from './blocks.remote'

  type Coords = { lat: number; long: number }

  // Shared body for the add/edit block forms: location breadcrumb, optional name, and the
  // recommended location field. The surrounding chrome (header, submit) lives in `Form`;
  // location state + actions are owned by the parent (`BlockForm`). Mirrors AreaFormFields.
  interface Props {
    form: RemoteForm<CreateBlockInput, unknown>
    /** The crag the block belongs to. */
    area: AreaDetail
    location: Coords | null
    mapData: MapData
    locating: boolean
    onUseCurrentLocation: () => void
    onPickLocation: () => void
    onRemove: () => void
  }

  const { form, area, location, mapData, locating, onUseCurrentLocation, onPickLocation, onRemove }: Props = $props()

  const global = getGlobalState()
</script>

<!-- Submitted values not typed directly: the area and the picked location. -->
<input name="areaId" type="hidden" value={area.id} />
<input name="lat" type="hidden" value={location?.lat ?? ''} />
<input name="long" type="hidden" value={location?.long ?? ''} />

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

<BlockLocationField {location} {mapData} {locating} {onUseCurrentLocation} {onPickLocation} {onRemove} />
