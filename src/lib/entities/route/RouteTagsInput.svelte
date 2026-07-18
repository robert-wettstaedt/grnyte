<script lang="ts">
  import type { Tag } from '$lib/entities/tag/dto'
  import { m } from '$lib/paraglide/messages'

  // Toggleable chip set over the global tag list, submitting through hidden
  // `<name>[i]` inputs.
  interface Props {
    /** Hidden-input name the selected ids submit under (as `<name>[i]`). */
    name?: string
    tags: Tag[]
    /** Selected tag ids. */
    value?: string[]
  }

  let { name, tags, value = $bindable([]) }: Props = $props()

  const toggle = (id: string) => {
    value = value.includes(id) ? value.filter((tag) => tag !== id) : [...value, id]
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
  {#each tags as tag (tag.id)}
    {@const selected = value.includes(tag.id)}
    <button
      aria-pressed={selected}
      class={[
        'flex h-9 items-center rounded-full border px-3.5 text-[13px] font-semibold transition-colors',
        selected
          ? 'border-primary-500/40 bg-primary-500/20 text-primary-400'
          : 'border-surface-300-700 bg-surface-100-900 text-surface-600-400 hover:bg-surface-200-800',
      ]}
      onclick={() => toggle(tag.id)}
      type="button"
    >
      {tag.id}
    </button>
  {/each}
</div>
