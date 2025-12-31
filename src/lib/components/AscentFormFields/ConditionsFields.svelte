<script lang="ts">
  import type { Row } from '$lib/db/zero'
  import { Accordion, Slider } from '@skeletonlabs/skeleton-svelte'

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

<Accordion base="mt-4" collapsible onValueChange={(e) => (accordion = e.value)} value={accordion}>
  <Accordion.Item
    panelClasses="border-surface-500 my-2 rounded-md border-2 px-4 py-2"
    controlPadding="px-0"
    panelPadding="p-2 pb-16"
    value="conditions"
  >
    {#snippet control()}
      Conditions
    {/snippet}

    {#snippet panel()}
      <label class="label my-4 flex items-center justify-between">
        <span> Temperature </span>

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
      </label>

      <Slider
        defaultValue={defaultTemperature}
        height="h-2"
        markers={[-20, -10, 0, 10, 20, 30, 40]}
        markersBase="mt-2"
        max={maxTemp}
        min={minTemp}
        meterBg={tempColorClass.meterBg}
        thumbRingColor={tempColorClass.thumbRingColor}
        onValueChange={(e) => (temperature = e.value[0])}
        value={temperature == null ? undefined : [temperature]}
      />

      <label class="label mt-16 mb-4 flex items-center justify-between">
        <span> Humidity </span>

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
      </label>

      <Slider
        defaultValue={defaultHumidity}
        height="h-2"
        markers={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
        markersBase="mt-2"
        meterBg={humidityColorClass.meterBg}
        thumbRingColor={humidityColorClass.thumbRingColor}
        onValueChange={(e) => (humidity = e.value[0])}
        value={humidity == null ? undefined : [humidity]}
      />
    {/snippet}
  </Accordion.Item>
</Accordion>

<input name="temperature" type="hidden" value={temperature} />
<input name="humidity" type="hidden" value={humidity} />
