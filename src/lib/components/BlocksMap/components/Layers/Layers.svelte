<script module lang="ts">
  export interface Layer {
    label: string
    name: string
  }
</script>

<script lang="ts">
  import { slide } from 'svelte/transition'

  interface Props {
    layers: Layer[]
    onChange?: (visibleLayers: string[]) => void
  }

  const { layers, onChange }: Props = $props()

  let visibleLayers = $state(layers.map((layer) => layer.name))

  const onChangeCheckbox = (layer: Layer, event: Event) => {
    const target = event.target as HTMLInputElement

    if (target.checked) {
      visibleLayers = Array.from(new Set([...visibleLayers, layer.name]))
    } else {
      visibleLayers = visibleLayers.filter((name) => name !== layer.name)
    }

    onChange?.(visibleLayers)
  }
</script>

<form
  class="absolute right-[calc(var(--ol-control-height)+var(--ol-control-margin))] bottom-[calc(var(--ol-control-height)+var(--ol-control-margin))] w-[165px] overflow-hidden rounded-[4px] bg-[var(--ol-subtle-background-color)]"
  transition:slide={{ axis: 'x', duration: 100 }}
>
  <fieldset class="m-[1px] overflow-hidden rounded-[2px] bg-[var(--ol-background-color)] p-2">
    {#each layers as layer}
      <label class="flex items-center space-x-2 whitespace-nowrap text-[var(--ol-subtle-foreground-color)]">
        <input
          class="checkbox"
          type="checkbox"
          checked={visibleLayers.includes(layer.name)}
          onchange={onChangeCheckbox.bind(null, layer)}
        />
        <p>{layer.label}</p>
      </label>
    {/each}
  </fieldset>
</form>
