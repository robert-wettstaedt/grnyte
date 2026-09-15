<script lang="ts" generics="T extends string">
  // A settings-row dropdown. `id` ties it to the row's <label for>, which supplies the accessible
  // name. Generic over its option values so callers keep their union type end to end (no casts).
  interface Option {
    label: string
    value: T
  }

  interface Props {
    id: string
    onchange: (value: T) => void
    options: Option[]
    value: T
  }

  const { id, onchange, options, value }: Props = $props()
</script>

<!-- min-h-11: the skeleton `.select` is 32px tall, under the 44px touch minimum. -->
<select {id} class="select min-h-11 w-32" {value} onchange={(event) => onchange(event.currentTarget.value as T)}>
  {#each options as option (option.value)}
    <option value={option.value}>{option.label}</option>
  {/each}
</select>
