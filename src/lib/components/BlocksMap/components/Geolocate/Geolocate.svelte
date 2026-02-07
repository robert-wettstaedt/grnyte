<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Dialog from '$lib/components/Dialog'
  import OlGeolocation from 'ol/Geolocation.js'
  import type Map from 'ol/Map'
  import OlMap from 'ol/Map.js'
  import Overlay from 'ol/Overlay'
  import type { Coordinate } from 'ol/coordinate'
  import { fromLonLat } from 'ol/proj.js'
  import GeolocationMarker from '../../assets/geolocation_marker.png'
  import GeolocationMarkerHeading from '../../assets/geolocation_marker_heading.png'
  import { getI18n } from '$lib/i18n'

  const STORAGE_KEY = `[${PUBLIC_APPLICATION_NAME}].geolocation`
  const { t } = getI18n()

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
      sessionStorage.removeItem(STORAGE_KEY)
    })

    map.on('pointerdrag', () => {
      isTrackingGeolocation = false
    })
  }

  const geolocate = async (moveMap: boolean) => {
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
      sessionStorage.setItem(STORAGE_KEY, 'true')
      isGeolocationError = false

      if (moveMap) {
        isTrackingGeolocation = true
        map?.getView().animate({ center: fromLonLat(position), zoom: 18, duration: 100 })
      }
    }
  }

  $effect(() => {
    map != null && createGeolocation(map)
  })

  $effect(() => {
    if (sessionStorage.getItem(STORAGE_KEY) != null) {
      geolocate(false)
    }
  })
</script>

<button aria-label={t('map.geolocate')} onclick={() => geolocate(true)} title={t('map.geolocate')} type="button">
  <i
    class="fa-solid fa-location-crosshairs text-sm {isTrackingGeolocation
      ? 'text-primary-500'
      : isGeolocationError
        ? 'text-error-500'
        : ''}"
  ></i>
</button>

<Dialog open={modalOpen} onOpenChange={(event) => (modalOpen = event.open)} title={t('map.geolocationErrorTitle')}>
  {#snippet content()}
    <p>{t('map.geolocationErrorMessage')}</p>

    <ul class="mt-4 list-inside list-disc">
      <li>{t('map.geolocationError.enableLocationServices')}</li>
      <li>{t('map.geolocationError.sharePermission')}</li>
      <li>{t('map.geolocationError.gpsSignal')}</li>
      <li>{t('map.geolocationError.tryDifferentBrowser')}</li>
    </ul>
  {/snippet}
</Dialog>
