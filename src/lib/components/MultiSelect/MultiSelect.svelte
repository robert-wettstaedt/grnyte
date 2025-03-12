<script lang="ts">
  import { Combobox } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    options: string[]
    value: string[] | undefined | null
    name?: string
  }

  let { options, name, value = $bindable() }: Props = $props()

  const availableOptions = $derived(
    options.filter((option) => !value?.includes(option)).map((option) => ({ label: option, value: option })),
  )
</script>

{#if value != null}
  <ul class="!mb-4 flex flex-col gap-2">
    {#each value as val}
      <li class="flex items-center justify-between">
        <span>{val}</span>

        <button
          aria-label="Remove"
          class="btn-icon preset-outlined-error-500"
          onclick={() => (value = value?.filter((v) => v !== val))}
        >
          <i class="fa-solid fa-xmark"></i>
        </button>

        <input {name} hidden value={val} />
      </li>
    {/each}
  </ul>
{/if}

<Combobox
  allowCustomValue
  contentClasses="max-h-[200px] md:max-h-[400px] overflow-auto"
  data={availableOptions}
  onValueChange={(event) => (value = [...(value ?? []), ...event.value])}
  placeholder="Search..."
/>
