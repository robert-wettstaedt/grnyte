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
  class="absolute bottom-[calc(var(--ol-control-height)+var(--ol-control-margin))] right-[calc(var(--ol-control-height)+var(--ol-control-margin))] w-[165px] bg-[--ol-subtle-background-color] rounded-[4px] overflow-hidden"
  transition:slide={{ axis: 'x', duration: 100 }}
>
  <fieldset class="bg-[--ol-background-color] m-[1px] p-2 rounded-[2px] overflow-hidden">
    {#each layers as layer}
      <label class="flex items-center space-x-2 text-[--ol-subtle-foreground-color] whitespace-nowrap border">
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
