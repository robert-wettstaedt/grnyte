<script lang="ts">
  import type { Row } from '$lib/db/zero'
  import { Accordion, Slider } from '@skeletonlabs/skeleton-svelte'
  import { slide } from 'svelte/transition'

  interface Props {
    humidity: Row<'ascents'>['humidity'] | null | undefined
    temperature: Row<'ascents'>['temperature'] | null | undefined
  }

  let { humidity = $bindable(), temperature = $bindable() }: Props = $props()

  let accordion = $state<string[]>(humidity != null || temperature != null ? ['conditions'] : [])

  const defaultTemperature = $derived.by(() => {
    const temps = [-2.8, -0.8, 3.5, 8.4, 13.2, 16.9, 19.2, 19.3, 14.7, 9.5, 4.4, -0.7]
    const month = new Date().getMonth()
    const currentTemp = Math.round(temps[month])
    return [currentTemp]
  })

  const defaultHumidity = [70]

  // Temperature → Tailwind color interpolation (blue → red across steps)
  const minTemp = -20
  const maxTemp = 40
  const step = 10

  // Seven stops matching the slider markers [-20, -10, 0, 10, 20, 30, 40]
  const tempColorBackgrounds = [
    'bg-cyan-600',
    'bg-blue-600',
    'bg-green-600',
    'bg-green-600',
    'bg-amber-600',
    'bg-orange-600',
    'bg-red-600',
  ]
  const tempColorRings = [
    'ring-cyan-600',
    'ring-blue-600',
    'ring-green-600',
    'ring-green-600',
    'ring-amber-600',
    'ring-orange-600',
    'ring-red-600',
  ]

  const displayTemperature = $derived.by(() => temperature ?? defaultTemperature[0])

  const tempColorClass = $derived.by(() => {
    const idx = Math.round((displayTemperature - minTemp) / step)
    const clamped = Math.max(0, Math.min(tempColorBackgrounds.length - 1, idx))
    const meterBg = tempColorBackgrounds[clamped]
    const thumbRingColor = tempColorRings[clamped]

    return { meterBg, thumbRingColor }
  })

  // Humidity → Tailwind color bands
  const displayHumidity = $derived.by(() => humidity ?? defaultHumidity[0])

  const humidityColorBackgrounds = ['bg-green-600', 'bg-amber-600', 'bg-orange-600', 'bg-red-600']
  const humidityColorRings = ['ring-green-600', 'ring-amber-600', 'ring-orange-600', 'ring-red-600']

  const humidityColorClass = $derived.by(() => {
    const h = displayHumidity
    let idx = 0
    if (h <= 55) idx = 0
    else if (h <= 70) idx = 1
    else if (h <= 85) idx = 2
    else idx = 3
    return {
      meterBg: humidityColorBackgrounds[idx],
      thumbRingColor: humidityColorRings[idx],
    }
  })
</script>

<Accordion class="mt-4" collapsible onValueChange={(e) => (accordion = e.value)} value={accordion}>
  <Accordion.Item value="club">
    <h3>
      <Accordion.ItemTrigger class="flex items-center justify-between gap-2 px-0">
        Conditions

        <Accordion.ItemIndicator class="group">
          <i class="fa-solid fa-chevron-down transition group-data-[state=open]:rotate-180"></i>
        </Accordion.ItemIndicator>
      </Accordion.ItemTrigger>
    </h3>

    <Accordion.ItemContent class="border-surface-500 my-2 rounded-md border-2">
      {#snippet element(attributes)}
        {#if !attributes.hidden}
          <div {...attributes} transition:slide={{ duration: 150 }}>
            <Slider
              class="mb-12"
              defaultValue={defaultTemperature}
              max={maxTemp}
              min={minTemp}
              onValueChange={(e) => (temperature = e.value[0])}
              value={temperature == null ? undefined : [temperature]}
            >
              <Slider.Label class="my-4 flex items-center justify-between">
                <span>
                  <i class="fa-solid fa-temperature-full"></i>
                  Temperature
                </span>

                <span>
                  {displayTemperature}°C

                  <button
                    aria-label="Clear"
                    class="btn preset-filled-surface-500 h-9 w-9"
                    disabled={temperature == null}
                    onclick={() => (temperature = null)}
                    type="button"
                  >
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                </span>
              </Slider.Label>

              <Slider.Control>
                <Slider.Track>
                  <Slider.Range class={tempColorClass.meterBg} />
                </Slider.Track>

                <Slider.Thumb class={tempColorClass.thumbRingColor} index={0}>
                  <Slider.HiddenInput />
                </Slider.Thumb>
              </Slider.Control>

              <Slider.MarkerGroup>
                <Slider.Marker value={-20} />
                <Slider.Marker value={-10} />
                <Slider.Marker value={0} />
                <Slider.Marker value={10} />
                <Slider.Marker value={20} />
                <Slider.Marker value={30} />
                <Slider.Marker value={40} />
              </Slider.MarkerGroup>
            </Slider>

            <Slider
              class="mb-12"
              defaultValue={defaultHumidity}
              onValueChange={(e) => (humidity = e.value[0])}
              value={humidity == null ? undefined : [humidity]}
            >
              <Slider.Label class="my-4 flex items-center justify-between">
                <span>
                  <i class="fa-solid fa-droplet"></i>
                  Humidity
                </span>

                <span>
                  {displayHumidity}%

                  <button
                    aria-label="Clear"
                    class="btn preset-filled-surface-500 h-9 w-9"
                    disabled={humidity == null}
                    onclick={() => (humidity = null)}
                    type="button"
                  >
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                </span>
              </Slider.Label>

              <Slider.Control>
                <Slider.Track>
                  <Slider.Range class={humidityColorClass.meterBg} />
                </Slider.Track>

                <Slider.Thumb class={humidityColorClass.thumbRingColor} index={0}>
                  <Slider.HiddenInput />
                </Slider.Thumb>
              </Slider.Control>

              <Slider.MarkerGroup>
                <Slider.Marker value={0} />
                <Slider.Marker value={10} />
                <Slider.Marker value={20} />
                <Slider.Marker value={30} />
                <Slider.Marker value={40} />
                <Slider.Marker value={50} />
                <Slider.Marker value={60} />
                <Slider.Marker value={70} />
                <Slider.Marker value={80} />
                <Slider.Marker value={90} />
                <Slider.Marker value={100} />
              </Slider.MarkerGroup>
            </Slider>
          </div>
        {/if}
      {/snippet}
    </Accordion.ItemContent>
  </Accordion.Item>
</Accordion>

<input name="temperature" type="hidden" value={temperature} />
<input name="humidity" type="hidden" value={humidity} />
