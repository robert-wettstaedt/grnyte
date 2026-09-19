<script lang="ts">
  import { m } from '$lib/paraglide/messages'

  // Toggleable chip set over the region's tag vocabulary, submitting through hidden
  // `<name>[i]` inputs.
  interface Props {
    /** Hidden-input name the selected tags submit under (as `<name>[i]`). */
    name?: string
    /** The vocabulary of the region this route belongs to, in stored order. */
    tags: string[]
    /** Selected tags. */
    value?: string[]
  }

  let { name, tags, value = $bindable([]) }: Props = $props()

  // A tag the region retired between this device's last sync and now is still in `value`, so it
  // stays visible and removable on the route that carries it rather than vanishing from the chips
  // while silently staying selected.
  const options = $derived([...new Set([...tags, ...value])])

  const toggle = (tag: string) => {
    value = value.includes(tag) ? value.filter((selected) => selected !== tag) : [...value, tag]
  }
</script>

{#if name != null}
  {#each value as tag, index (tag)}
    <input name="{name}[{index}]" type="hidden" value={tag} />
  {/each}
{/if}

<p class="text-surface-600-400 text-right text-xs font-semibold">
  {value.length > 0 ? m.routes_form_tagsSelected({ count: value.length }) : m.routes_form_tagsHint()}
</p>

<div class="mt-2 flex flex-wrap gap-2">
  {#each options as tag (tag)}
    {@const selected = value.includes(tag)}
    <button
      aria-pressed={selected}
      class={[
        'flex h-9 items-center rounded-full border px-3.5 text-[13px] font-semibold transition-colors',
        selected
          ? 'border-primary-500/40 bg-primary-500/20 text-primary-700-300'
          : 'border-surface-300-700 bg-surface-100-900 text-surface-600-400 hover:bg-surface-200-800',
      ]}
      onclick={() => toggle(tag)}
      type="button"
    >
      {tag}
    </button>
  {/each}
</div>
