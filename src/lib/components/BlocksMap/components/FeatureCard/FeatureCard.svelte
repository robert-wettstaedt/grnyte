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
</script>

<div class="bg-primary-50-950 text-primary-50 h-24 overflow-hidden rounded shadow-lg">
  <div class="flex gap-2">
    {#if feature.avatar != null}
      <a class="h-24 w-24 min-w-24" href={feature.pathname}>
        {#if feature.avatar.src != null}
          <Image path={feature.avatar.src} size={96} />
        {:else if feature.avatar.icon != null}
          <i class="{feature.avatar.icon} flex h-full w-full items-center justify-center text-[4rem]"></i>
        {/if}
      </a>
    {/if}

    <div class="flex min-w-0 grow flex-col p-1">
      <a href={feature.pathname}>
        {#if feature.subtitle != null}
          <p class="overflow-hidden text-xs text-ellipsis whitespace-nowrap opacity-50">
            {feature.subtitle}
          </p>
        {/if}

        <p class="overflow-hidden text-sm text-ellipsis whitespace-nowrap">
          {feature.name}

          {#if feature.pathname}
            <i class="fa-solid fa-chevron-right text-xs"></i>
          {/if}
        </p>
      </a>

      {#if navigationUrl != null}
        <div class="mt-auto flex justify-end">
          <a href={navigationUrl} class="btn btn-sm preset-outlined-primary-500">
            <i class="fa-solid fa-diamond-turn-right"></i>Directions
          </a>
        </div>
      {/if}
    </div>
  </div>
</div>
