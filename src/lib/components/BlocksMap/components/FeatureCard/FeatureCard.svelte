<script lang="ts">
  import Image from '$lib/components/Image'
  import type { FeatureData } from '../../BlocksMap.svelte'

  interface Props {
    feature: FeatureData
  }

  const { feature }: Props = $props()

  const navigationUrl = $derived.by(() => {
    if (feature.geolocation == null) {
      return null
    }

    const coords = `${feature.geolocation.lat},${feature.geolocation.long}`
    const geoUrl = `geo:${coords}`
    const googleMapsUrl = `https://www.google.com/maps?q=${coords}`
    const appleMapsUrl = `maps://maps.apple.com/?q=${coords}`

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const isAndroid = /Android/.test(navigator.userAgent)

    return isIOS ? appleMapsUrl : isAndroid ? geoUrl : googleMapsUrl
  })

  console.log(feature)
</script>

<div class="h-20 bg-primary-50-950 overflow-hidden text-primary-50 shadow-lg rounded">
  <div class="flex gap-2">
    {#if feature.avatar != null}
      <div class="min-w-20 w-20 h-20">
        {#if feature.avatar.src != null}
          <Image path={feature.avatar.src} size={80} />
        {:else if feature.avatar.icon != null}
          <i class="{feature.avatar.icon} h-full w-full flex items-center justify-center text-[3rem]"></i>
        {/if}
      </div>
    {/if}

    <div class="flex flex-col min-w-0 grow p-1">
      <a href={feature.pathname}>
        {#if feature.subtitle != null}
          <p class="text-xs opacity-50 overflow-hidden text-ellipsis whitespace-nowrap">
            {feature.subtitle}
          </p>
        {/if}

        <p class="text-sm overflow-hidden text-ellipsis whitespace-nowrap">
          {feature.name}

          {#if feature.pathname}
            <i class="fa-solid fa-chevron-right text-xs"></i>
          {/if}
        </p>
      </a>

      {#if navigationUrl != null}
        <div class="mt-auto">
          <a href={navigationUrl} class="btn btn-sm preset-outlined-primary-500">
            <i class="fa-solid fa-diamond-turn-right"></i>Directions
          </a>
        </div>
      {/if}
    </div>
  </div>
</div>
