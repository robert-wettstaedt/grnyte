<script lang="ts">
  import type { AscentStatus } from '$lib/entities/route/resources.svelte'
  import { m } from '$lib/paraglide/messages'

  interface Props {
    /** Selected tick status; `''` means no filter ("any"). */
    value: AscentStatus | ''
  }

  let { value = $bindable() }: Props = $props()

  const options = $derived<{ value: AscentStatus | ''; label: string }[]>([
    { value: '', label: m.common_any() },
    { value: 'todo', label: m.filter_ascentTodo() },
    { value: 'project', label: m.filter_ascentProject() },
    { value: 'done', label: m.filter_ascentDone() },
  ])
</script>

<div class="flex flex-wrap gap-2" role="radiogroup" aria-label={m.filter_ascent()}>
  {#each options as option (option.value)}
    <button
      type="button"
      role="radio"
      aria-checked={value === option.value}
      class={['btn btn-sm', value === option.value ? 'preset-filled-primary-500' : 'preset-tonal']}
      onclick={() => (value = option.value)}
    >
      {option.label}
    </button>
  {/each}
</div>
