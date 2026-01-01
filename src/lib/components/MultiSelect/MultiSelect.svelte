<script lang="ts">
  import { Combobox, Portal } from '@skeletonlabs/skeleton-svelte'
  import { calculateRelevance } from './lib'

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
  let filteredOptions = $state(options)

  // Transform all available options to the format Combobox expects
  const availableOptions = $derived(
    inputValue.trim().length === 0 ? [] : filteredOptions.map((option) => ({ label: option, value: option })),
  )

  // Function to regenerate the available options on each input change
  function handleInputValueChange(event: InputValueChangeEvent) {
    inputValue = event.inputValue

    if (event.inputValue.trim().length === 0) {
      filteredOptions = options
      return
    }

    const scoredOptions = options
      .map((option) => ({ option, score: calculateRelevance(option, event.inputValue) }))
      .filter((item) => item.score > 0)
      .toSorted((a, b) => b.score - a.score)
      .map((item) => item.option)
      .slice(0, 15)

    filteredOptions = scoredOptions
  }

  // Handle when an item is selected from the dropdown
  function handleValueChange(event: ValueChangeEvent) {
    if (event.value != null && event.value.length > 0) {
      value = [...(value ?? []), ...event.value]
      inputValue = ''
    }
  }
</script>

{#if value != null}
  <ul class="mb-4! flex flex-col gap-2">
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
  onInputValueChange={handleInputValueChange}
  onValueChange={handleValueChange}
  placeholder="Search..."
>
  <Combobox.Control>
    <Combobox.Input />
    <Combobox.Trigger />
  </Combobox.Control>

  <Combobox.ClearTrigger>Clear All</Combobox.ClearTrigger>

  <Portal>
    <Combobox.Positioner>
      <Combobox.Content class="max-h-[200px] overflow-auto md:max-h-[400px]">
        {#each availableOptions as item (item.value)}
          <Combobox.Item {item}>
            <Combobox.ItemText>{item.label}</Combobox.ItemText>
            <Combobox.ItemIndicator />
          </Combobox.Item>
        {/each}
      </Combobox.Content>
    </Combobox.Positioner>
  </Portal>
</Combobox>
