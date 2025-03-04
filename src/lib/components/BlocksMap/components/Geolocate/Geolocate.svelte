<script lang="ts">
  import { Modal } from '@skeletonlabs/skeleton-svelte'
  import OlGeolocation from 'ol/Geolocation.js'
  import type Map from 'ol/Map'
  import OlMap from 'ol/Map.js'
  import Overlay from 'ol/Overlay'
  import type { Coordinate } from 'ol/coordinate'
  import { fromLonLat } from 'ol/proj.js'
  import GeolocationMarker from '../../assets/geolocation_marker.png'
  import GeolocationMarkerHeading from '../../assets/geolocation_marker_heading.png'

  interface Props {
    map: Map | undefined | null
  }

  const { map }: Props = $props()

  let isTrackingGeolocation = $state(false)
  let isGeolocationError = $state(false)
  let modalOpen = $state(false)
  const geolocation = $derived.by(() => new OlGeolocation({ trackingOptions: { enableHighAccuracy: true } }))

  const createGeolocation = (map: OlMap) => {
    const markerEl = document.createElement('img')
    markerEl.classList.add('select-none', 'pointer-events-none', 'touch-none')
    map.getTargetElement().appendChild(markerEl)

    const marker = new Overlay({
      positioning: 'center-center',
      element: markerEl,
      stopEvent: false,
    })
    map.addOverlay(marker)

    geolocation.on('change', (event) => {
      const position = event.target.get('position') as number[] | undefined

      if (position != null) {
        const coordinates = fromLonLat(position)
        marker.setPosition(coordinates)

        const speed = event.target.get('speed') as number | undefined
        const heading = event.target.get('heading') as number | undefined // radians

        if (speed != null && heading != null) {
          const deg = (heading * 360) / (Math.PI * 2)
          markerEl.src = GeolocationMarkerHeading
          markerEl.style.transform = `rotate(${deg}deg)`
        } else {
          markerEl.src = GeolocationMarker
        }

        if (isTrackingGeolocation) {
          map?.getView().animate({
            center: fromLonLat(position),
            duration: 100,
          })
        }
      }
    })

    geolocation.on('error', () => {
      isGeolocationError = true
      modalOpen = true
      isTrackingGeolocation = false
    })

    map.on('pointerdrag', () => {
      isTrackingGeolocation = false
    })
  }

  const geolocate = async () => {
    let position: Coordinate | undefined

    if (geolocation.getTracking()) {
      position = geolocation.getPosition()
    } else {
      geolocation.setTracking(true)
      position = await new Promise((resolve) => {
        geolocation.once('change', (event) => resolve(event.target.get('position')))
      })
    }

    if (position != null) {
      isTrackingGeolocation = true
      isGeolocationError = false
      map?.getView().animate({ center: fromLonLat(position), zoom: 18, duration: 100 })
    }
  }

  $effect(() => {
    map != null && createGeolocation(map)
  })
</script>

<button aria-label="Geolocate" onclick={geolocate} title="Geolocate" type="button">
  <i
    class="fa-solid fa-location-crosshairs text-sm {isTrackingGeolocation
      ? 'text-primary-500'
      : isGeolocationError
        ? 'text-error-500'
        : ''}"
  ></i>
</button>

<Modal
  open={modalOpen}
  onOpenChange={(event) => (modalOpen = event.open)}
  triggerBase="!hidden"
  contentBase="card bg-surface-100-900 p-4 space-y-4 shadow-xl max-w-screen-sm"
  backdropClasses="backdrop-blur-sm"
>
  {#snippet content()}
    <button
      aria-label="Close"
      class="fixed top-4 right-2 btn preset-filled-primary-500 w-12 h-12 rounded-full z-10"
      onclick={() => (modalOpen = false)}
    >
      <i class="fa-solid fa-xmark"></i>
    </button>

    <header>
      <h4 class="h4">Geolocation error</h4>
    </header>

    <article class="opacity-60">
      <p>The geolocation service is not working. Please check your browser settings and try again.</p>

      <ul class="list-disc list-inside mt-4">
        <li>Check if location services are enabled in your browser</li>
        <li>Ensure you have permission to share your location</li>
        <li>Check if you have a GPS signal</li>
        <li>Try a different browser or device</li>
      </ul>
    </article>
  {/snippet}
</Modal>
