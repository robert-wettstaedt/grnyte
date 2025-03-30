<script module lang="ts">
  import { onMount } from 'svelte'
  import { writable } from 'svelte/store'

  export interface Layer {
    label: string
    name: string
  }

  interface Props {
    layers: Layer[]
  }

  export const visibleLayers = writable<string[] | null>(null)
</script>

<script lang="ts">
  import { slide } from 'svelte/transition'

  const { layers }: Props = $props()

  onMount(() => {
    const unsubscribe = visibleLayers.subscribe((value) => {
      if (value == null) {
        visibleLayers.set(layers.map((layer) => layer.name))
      }
    })

    return () => {
      unsubscribe()
    }
  })

  const onChangeCheckbox = (layer: Layer, event: Event) => {
    const target = event.target as HTMLInputElement

    if (target.checked) {
      visibleLayers.set(Array.from(new Set([...($visibleLayers ?? []), layer.name])))
    } else {
      visibleLayers.set(($visibleLayers ?? []).filter((name) => name !== layer.name))
    }
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
          checked={($visibleLayers ?? []).includes(layer.name)}
          onchange={onChangeCheckbox.bind(null, layer)}
        />
        <p>{layer.label}</p>
      </label>
    {/each}
  </fieldset>
</form>
