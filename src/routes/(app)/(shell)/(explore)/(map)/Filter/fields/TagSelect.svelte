<script lang="ts">
  import { m } from '$lib/paraglide/messages'

  interface Props {
    /** The union across every region the user belongs to, already deduped by the caller. */
    tags: string[]
    value: string[]
  }

  let { tags, value = $bindable() }: Props = $props()

  const toggle = (tag: string) => {
    if (value.includes(tag)) {
      value = value.filter((v) => v !== tag)
    } else {
      value = [...value, tag]
    }
  }
</script>

<div class="flex flex-wrap gap-2" role="group" aria-label={m.filter_tags()}>
  {#each tags as tag (tag)}
    <button
      type="button"
      aria-pressed={value.includes(tag)}
      class={['btn btn-sm', value.includes(tag) ? 'preset-filled-primary-500' : 'preset-tonal']}
      onclick={() => toggle(tag)}
    >
      {tag}
    </button>
  {/each}
</div>
