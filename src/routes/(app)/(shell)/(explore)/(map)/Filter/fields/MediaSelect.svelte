<script lang="ts">
  import { m } from '$lib/paraglide/messages'

  export type MediaFilter = 'hasBeta' | 'hasTopo'

  interface Props {
    value: MediaFilter[]
  }

  let { value = $bindable() }: Props = $props()

  const toggle = (filter: MediaFilter) => {
    if (value.includes(filter)) {
      value = value.filter((v) => v !== filter)
    } else {
      value = [...value, filter]
    }
  }

  const options: { label: () => string; value: MediaFilter }[] = [
    { label: () => m.filter_hasTopo(), value: 'hasTopo' },
    { label: () => m.filter_hasBeta(), value: 'hasBeta' },
  ]
</script>

<div class="flex flex-wrap gap-2" role="group" aria-label={m.filter_media()}>
  {#each options as option (option.value)}
    <button
      type="button"
      aria-pressed={value.includes(option.value)}
      class={['btn btn-sm', value.includes(option.value) ? 'preset-filled-primary-500' : 'preset-tonal']}
      onclick={() => toggle(option.value)}
    >
      {option.label()}
    </button>
  {/each}
</div>
