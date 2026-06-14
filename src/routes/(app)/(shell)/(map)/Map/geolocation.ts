import OlGeolocation from 'ol/Geolocation.js'
import type OlMap from 'ol/Map.js'
import Overlay from 'ol/Overlay.js'

interface GeolocationCallbacks {
  getIsTracking: () => boolean
  setIsTracking: (value: boolean) => void
  setIsError: (value: boolean) => void
}

export function setupGeolocation(mapInstance: OlMap, callbacks: GeolocationCallbacks): () => void {
  const geolocation = new OlGeolocation({
    trackingOptions: { enableHighAccuracy: true },
    projection: mapInstance.getView().getProjection(),
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
    callbacks.setIsError(false)

    if (callbacks.getIsTracking()) {
      mapInstance.getView().animate({ center: position, duration: 200 })
    }
  })

  geolocation.on('error', () => {
    callbacks.setIsError(true)
    callbacks.setIsTracking(false)
  })

  mapInstance.on('pointerdrag', () => {
    callbacks.setIsTracking(false)
  })

  return () => {
    geolocation.setTracking(false)
  }
}
