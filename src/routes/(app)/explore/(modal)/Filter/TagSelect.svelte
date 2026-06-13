<script lang="ts">
  import type { Tag } from '$lib/entities/tag/dto'
  import { m } from '$lib/paraglide/messages'

  interface Props {
    tags: Tag[]
    value: string[]
  }

  let { tags, value = $bindable() }: Props = $props()

  const toggle = (tagId: string) => {
    if (value.includes(tagId)) {
      value = value.filter((v) => v !== tagId)
    } else {
      value = [...value, tagId]
    }
  }
</script>

<div class="flex flex-col gap-2">
  <span class="text-sm font-medium">{m.filter_tags()}</span>

  <div class="flex flex-wrap gap-2" role="group" aria-label={m.filter_tags()}>
    {#each tags as tag (tag.id)}
      <button
        type="button"
        aria-pressed={value.includes(tag.id)}
        class={['btn btn-sm', value.includes(tag.id) ? 'preset-filled-primary-500' : 'preset-tonal']}
        onclick={() => toggle(tag.id)}
      >
        {tag.id}
      </button>
    {/each}
  </div>
</div>
