<script lang="ts">
  import { m } from '$lib/paraglide/messages'
  import { STATUS } from './AscentType.svelte'
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

  const types: { type: AscentType; label: string }[] = [
    { type: 'flash', label: m.ascents_form_typeFlash() },
    { type: 'send', label: m.ascents_form_typeSend() },
    { type: 'attempt', label: m.ascents_form_typeAttempt() },
    { type: 'repeat', label: m.ascents_form_typeRepeat() },
  ]
</script>

{#if name != null}
  <input {name} type="hidden" value={value ?? ''} />
{/if}

<div class="grid grid-cols-4 gap-2" role="radiogroup" aria-label={m.ascents_form_typeLabel()}>
  {#each types as { type, label } (type)}
    {@const info = STATUS[type]}
    {@const active = value === type}
    <button
      aria-checked={active}
      class={[
        'flex flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-3 text-xs font-bold',
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
      {label}
    </button>
  {/each}
</div>
