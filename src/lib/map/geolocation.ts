import OlGeolocation from 'ol/Geolocation.js'
import type OlMap from 'ol/Map.js'
import Overlay from 'ol/Overlay.js'

interface GeolocationCallbacks {
  getHasFocus: () => boolean
  getIsTracking: () => boolean
  /** `GeolocationPositionError.code` while failing, `undefined` once a fix arrives. */
  setError: (code: number | undefined) => void
  setIsTracking: (value: boolean) => void
}

export function setupGeolocation(mapInstance: OlMap, callbacks: GeolocationCallbacks): () => void {
  const geolocation = new OlGeolocation({
    projection: mapInstance.getView().getProjection(),
    // ponytail: 10s timeout so a device that can never get a high-accuracy fix (indoors,
    // desktop without wifi positioning) errors out instead of hanging forever on the spec
    // default of Infinity. Tune if real devices need longer.
    trackingOptions: { enableHighAccuracy: true, timeout: 10_000 },
  })
  mapInstance.set('geolocation', geolocation)

  const geolocationOverlay = new Overlay({
    positioning: 'center-center',
    stopEvent: false,
  })
  mapInstance.addOverlay(geolocationOverlay)

  let markerEl: HTMLDivElement | null = null

  geolocation.on('change', () => {
    const position = geolocation.getPosition()
    if (position == null) return

    if (markerEl == null) {
      markerEl = document.createElement('div')
      markerEl.className = 'geolocation-marker'
      geolocationOverlay.setElement(markerEl)
    }

    geolocationOverlay.setPosition(position)
    callbacks.setError(undefined)

    if (callbacks.getIsTracking()) {
      mapInstance.getView().animate({ center: position, duration: 200 })
    }
  })

  geolocation.on('error', (event) => {
    callbacks.setError(event.code)
    callbacks.setIsTracking(false)
    // Required, not redundant: OL only re-arms watchPosition when TRACKING
    // changes value. Left true, the retry click's setTracking(true) is a silent no-op.
    geolocation.setTracking(false)
  })

  mapInstance.on('pointerdrag', () => {
    callbacks.setIsTracking(false)
  })

  // Reuse an already-granted permission: resume tracking on (re)mount without re-prompting.
  // Querying the Permissions API never shows a prompt.
  void navigator.permissions
    ?.query({ name: 'geolocation' })
    .then((status) => {
      if (status.state !== 'granted') return
      geolocation.setTracking(true)
      // Show the marker, but don't hijack the view when the map is focused on a target.
      if (!callbacks.getHasFocus()) callbacks.setIsTracking(true)
    })
    .catch(() => {})

  return () => {
    geolocation.setTracking(false)
  }
}
