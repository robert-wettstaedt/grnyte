<script lang="ts">
  import { m } from '$lib/paraglide/messages'

  export type MediaFilter = 'hasTopo' | 'hasBeta'

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

  const options: { value: MediaFilter; label: () => string }[] = [
    { value: 'hasTopo', label: () => m.filter_hasTopo() },
    { value: 'hasBeta', label: () => m.filter_hasBeta() },
  ]
</script>

<div class="flex flex-col gap-2">
  <span class="text-sm font-medium">{m.filter_media()}</span>

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
</div>
