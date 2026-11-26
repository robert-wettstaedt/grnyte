<!-- A layer's coverage: read from the service and shown read-only, or typed when the service gives
     none. Holds its height while reading, so the fields below do not move when the answer lands. -->
<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { LonLatBounds } from '$lib/entities/region/settings'
  import FieldWrapper from '$lib/forms/fields/FieldWrapper.svelte'
  import type { StoreField } from '$lib/forms/store.svelte'
  import { m } from '$lib/paraglide/messages'

  interface Props {
    field: StoreField<string | undefined>
    hasAddress: boolean
    read: LonLatBounds | null | undefined
  }

  const { field, hasAddress, read }: Props = $props()

  const LABELS = [
    m.region_mapLayerCoverageWest(),
    m.region_mapLayerCoverageSouth(),
    m.region_mapLayerCoverageEast(),
    m.region_mapLayerCoverageNorth(),
  ]

  const typed = $derived(String(field.value() ?? ''))
  const shown = $derived(read ?? (typed === '' ? null : typed.split(',').map(Number)))
</script>

<section aria-labelledby="layer-coverage" class="flex flex-col gap-2">
  <h2 id="layer-coverage" class="text-sm font-semibold">{m.region_mapLayerCoverage()}</h2>
  {#if read === null}
    {#if hasAddress}
      <p class="preset-tonal-warning flex gap-2 rounded-lg p-3 text-sm">
        <Icon class="mt-0.5 flex-none" name="info" size={16} />
        {m.region_mapLayerCoverageNone()}
      </p>
    {/if}
    <FieldWrapper {field} hint={m.region_mapLayerCoverageHint()} id="layer-bounds">
      {#snippet children(props)}
        <input
          {...field.as('text')}
          {...props}
          aria-label={m.region_mapLayerCoverage()}
          autocomplete="off"
          class="input font-mono"
          inputmode="decimal"
          placeholder="13.0, 47.4, 14.9, 48.8"
          spellcheck="false"
        />
      {/snippet}
    </FieldWrapper>
  {:else}
    {#if shown == null}
      <div class="bg-surface-100-900 text-surface-600-400 grid h-[50px] place-items-center rounded-lg text-sm">
        {m.region_mapLayerCoverageReading()}
      </div>
    {:else}
      <dl class="bg-surface-200-800 grid grid-cols-4 gap-px overflow-hidden rounded-lg">
        {#each LABELS as label, index (label)}
          <div class="bg-surface-100-900 px-2.5 py-1.5">
            <dt class="text-surface-600-400 text-[11px]">{label}</dt>
            <dd class="font-mono text-sm">{shown[index]?.toFixed(2)}</dd>
          </div>
        {/each}
      </dl>
    {/if}
    <!-- Invisible, not absent, while reading: its line is held so nothing below moves. -->
    <p class={['text-surface-600-400 flex items-start gap-1.5 text-sm', read == null && 'invisible']}>
      <Icon class="text-primary-500 mt-0.5 flex-none" name="check" size={16} />
      {m.region_mapLayerCoverageRead()}
    </p>
  {/if}
</section>
