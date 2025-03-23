<script lang="ts">
  import { Combobox } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    options: string[]
    value: string[] | undefined | null
    name?: string
  }

  // Define the input value change event type
  interface InputValueChangeEvent {
    inputValue: string
    [key: string]: any
  }

  // Define the value change event type to match what Combobox actually sends
  interface ValueChangeEvent {
    value: string[]
    [key: string]: any
  }

  let { options, name, value = $bindable() }: Props = $props()
  let inputValue = $state('')

  // Function to regenerate the available options on each input change
  function handleInputValueChange(event: InputValueChangeEvent) {
    inputValue = event.inputValue
  }

  // Handle when an item is selected from the dropdown
  function handleValueChange(event: ValueChangeEvent) {
    if (event.value != null && event.value.length > 0) {
      value = [...(value ?? []), ...event.value]
      inputValue = ''
    }
  }

  // Transform all available options to the format Combobox expects
  const availableOptions = $derived(options.map((option) => ({ label: option, value: option })))
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

<!-- Manual Add button for custom values -->
{#if inputValue && !value?.includes(inputValue)}
  <div class="mb-2">
    <button
      class="btn preset-filled-primary-500"
      onclick={() => {
        value = [...(value ?? []), inputValue]
        inputValue = ''
      }}
    >
      Add "{inputValue}"
    </button>
  </div>
{/if}

<Combobox
  allowCustomValue
  contentClasses="max-h-[200px] md:max-h-[400px] overflow-auto"
  data={availableOptions}
  onInputValueChange={handleInputValueChange}
  onValueChange={handleValueChange}
  placeholder="Search..."
/>
