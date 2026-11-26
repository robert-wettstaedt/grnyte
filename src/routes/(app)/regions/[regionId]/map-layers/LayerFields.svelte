<!-- One layer's fields. The maximum zoom sits behind the symptom it fixes: only services that show a
     placeholder past their data need it. -->
<script lang="ts">
  import { resolve } from '$app/paths'
  import Disclosure from '$lib/components/Disclosure/Disclosure.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import {
    BBOX_PLACEHOLDER,
    mapLayerSegment,
    type LonLatBounds,
    type MapLayer,
    type mapLayerSchema,
  } from '$lib/entities/region/settings'
  import FieldWrapper from '$lib/forms/fields/FieldWrapper.svelte'
  import type { NestedField } from '$lib/forms/store.svelte'
  import type * as z from '$lib/forms/zod'
  import { m } from '$lib/paraglide/messages'
  import LayerCoverage from './LayerCoverage.svelte'

  interface Props {
    capOpen: boolean
    hasAddress: boolean
    hiddenInvalid: MapLayer[]
    onAddressInput: (event: Event) => void
    read: LonLatBounds | null | undefined
    regionId: number
    row: NestedField<z.input<typeof mapLayerSchema>>
  }

  let { capOpen = $bindable(), hasAddress, hiddenInvalid, onAddressInput, read, regionId, row }: Props = $props()
</script>

{#if hiddenInvalid.length > 0}
  <div class="preset-tonal-warning rounded-lg p-3 text-sm" role="alert">
    <p>{m.region_mapLayerHiddenInvalid()}</p>
    <ul class="mt-1 list-disc pl-5">
      {#each hiddenInvalid as layer, index (index)}
        <li>
          <a
            class="underline"
            href={resolve('/(app)/regions/[regionId]/map-layers/[layer]', {
              layer: mapLayerSegment(layer),
              regionId: String(regionId),
            })}
          >
            {layer.name}
          </a>
        </li>
      {/each}
    </ul>
  </div>
{/if}

<FieldWrapper field={row.name} id="layer-name" label={m.region_mapLayerName()} required>
  {#snippet children(props)}
    <input {...row.name.as('text')} {...props} autocomplete="off" class="input" />
  {/snippet}
</FieldWrapper>

<FieldWrapper
  field={row.url}
  hint={m.region_mapLayerUrlHint({ placeholder: BBOX_PLACEHOLDER })}
  id="layer-url"
  label={m.region_mapLayerUrl()}
  required
>
  {#snippet children(props)}
    <textarea
      {...row.url.as('text')}
      {...props}
      autocapitalize="none"
      autocomplete="off"
      class="textarea font-mono text-sm break-all"
      oninput={onAddressInput}
      rows="3"
      spellcheck="false"
    ></textarea>
  {/snippet}
</FieldWrapper>

<LayerCoverage field={row.bounds} {hasAddress} {read} />

<div class="grid items-start gap-4 sm:grid-cols-2">
  <FieldWrapper field={row.opacity} id="layer-opacity" label={m.region_mapLayerOpacity()}>
    {#snippet children(props)}
      <input
        {...row.opacity.as('text')}
        {...props}
        autocomplete="off"
        class="input"
        inputmode="decimal"
        placeholder="1"
      />
    {/snippet}
  </FieldWrapper>

  <FieldWrapper
    field={row.minZoom}
    hint={m.region_mapLayerMinZoomHint()}
    id="layer-minZoom"
    label={m.region_mapLayerMinZoom()}
  >
    {#snippet children(props)}
      <input
        {...row.minZoom.as('text')}
        {...props}
        autocomplete="off"
        class="input"
        inputmode="numeric"
        placeholder="0"
      />
    {/snippet}
  </FieldWrapper>
</div>

<FieldWrapper
  field={row.attributions}
  hint={m.region_mapLayerAttributionsHint()}
  id="layer-attributions"
  label={m.region_mapLayerAttributions()}
>
  {#snippet children(props)}
    <textarea {...row.attributions.as('text')} {...props} class="textarea" rows="2"></textarea>
  {/snippet}
</FieldWrapper>

<Disclosure bind:open={capOpen} class="bg-surface-100-900 rounded-lg" panelClass="px-3 pb-3" summaryClass="w-full">
  {#snippet summary(open)}
    <span class="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm font-semibold">
      <span class="flex-1">{m.region_mapLayerPlaceholderSection()}</span>
      <Icon name={open ? 'chevron-down' : 'chevron-right'} size={16} />
    </span>
  {/snippet}
  <FieldWrapper
    field={row.maxZoom}
    hint={m.region_mapLayerMaxZoomHint()}
    id="layer-maxZoom"
    label={m.region_mapLayerMaxZoom()}
  >
    {#snippet children(props)}
      <input
        {...row.maxZoom.as('text')}
        {...props}
        autocomplete="off"
        class="input max-w-36"
        inputmode="numeric"
        placeholder="28"
      />
    {/snippet}
  </FieldWrapper>
</Disclosure>
