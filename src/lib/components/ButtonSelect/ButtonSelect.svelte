<script lang="ts">
  import type { RemoteFormField } from '@sveltejs/kit'

  interface Props {
    'aria-errormessage'?: string
    multiple?: boolean
    options: { value: string; label: string }[]
    field: RemoteFormField<string | string[]>
  }

  let { multiple = false, options, field, ...props }: Props = $props()

  const value = $derived(field.value())
</script>

<div class="flex flex-wrap gap-2">
  {#if multiple}
    <select {...props} hidden {...field.as('select multiple')}>
      {#each options as option (option.value)}
        <option value={option.value}>
          {option.label}
        </option>
      {/each}
    </select>
  {:else}
    <input {...props} type="hidden" {...field.as('select')} />
  {/if}

  {#each options as option (option.value)}
    {@const isSelected =
      (multiple && Array.isArray(value) && value.includes(option.value)) || (!multiple && value === option.value)}

    <button
      class={['btn btn-sm', isSelected ? 'preset-filled-primary-500 preset-outlined-primary-500' : 'preset-outlined']}
      onclick={(event) => {
        event.preventDefault()

        if (multiple) {
          const arr = Array.isArray(value) ? value : value == null ? [] : [value]

          if (isSelected) {
            field.set(arr.filter((v) => v !== option.value))
          } else {
            field.set([...arr, option.value])
          }
        } else {
          if (isSelected) {
            field.set(undefined)
          } else {
            field.set(option.value)
          }
        }
      }}
    >
      {option.label}
    </button>
  {/each}
</div>
