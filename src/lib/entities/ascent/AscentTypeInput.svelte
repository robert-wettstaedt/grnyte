<script lang="ts">
  import { m } from '$lib/paraglide/messages'
  import { ASCENT_TYPES, STATUS } from './AscentType.svelte'
  import AscentTypeGlyph from './AscentTypeGlyph.svelte'
  import type { AscentType } from './dto'

  // Ascent-type picker: one card per type, sharing AscentType's glyphs and colours.
  // No tap-again-to-clear, an ascent always has a type.
  interface Props {
    /** When set, the type submits through a hidden input with this name (empty when unset). */
    name?: string
    value?: AscentType | undefined
  }

  let { name, value = $bindable() }: Props = $props()
</script>

{#if name != null}
  <input {name} type="hidden" value={value ?? ''} />
{/if}

<div class="grid grid-cols-4 gap-1" role="radiogroup" aria-label={m.ascents_form_typeLabel()}>
  {#each ASCENT_TYPES as { label, type } (type)}
    {@const info = STATUS[type]}
    {@const active = value === type}
    <button
      aria-checked={active}
      class={[
        'flex flex-col items-center justify-center gap-1.5 rounded-xl border px-0.5 py-3 text-center text-[10.5px] font-bold tracking-tight wrap-break-word hyphens-auto',
        !active && 'border-surface-300-700 bg-surface-100-900 hover:bg-surface-200-800',
      ]}
      style={active
        ? `border-color: ${info.color}; background: color-mix(in oklab, ${info.color} 16%, transparent)`
        : ''}
      onclick={() => (value = type)}
      role="radio"
      type="button"
    >
      <AscentTypeGlyph {info} size={20} />
      {label()}
    </button>
  {/each}
</div>
