import OlGeolocation from 'ol/Geolocation.js'
import type OlMap from 'ol/Map.js'
import Overlay from 'ol/Overlay.js'

interface GeolocationCallbacks {
  /** Every fix, in the view's projection. Whether it moves the camera is the camera's decision. */
  onFix: (position: number[]) => void
  /** Following ended for a reason only this module knows about, so the camera is released. */
  onFollowEnded: () => void
  /** `GeolocationPositionError.code` while failing, `undefined` once a fix arrives. */
  setError: (code: number | undefined) => void
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
  // Unwrapped so the cone takes the short way round at 359° -> 0° instead of spinning back.
  let shownHeading: number | undefined

  // Heading is north-based; the marker sits in screen space, so subtract the view rotation.
  const applyHeading = () => {
    if (markerEl == null) return
    const heading = geolocation.getHeading()
    const speed = geolocation.getSpeed()
    // Standing still, heading is noise (and most browsers report none at all).
    const moving = heading != null && (speed == null || speed > 0.5)

    markerEl.classList.toggle('geolocation-marker--moving', moving)
    if (!moving) return

    const target = heading - mapInstance.getView().getRotation()
    const turn = Math.atan2(Math.sin(target - (shownHeading ?? target)), Math.cos(target - (shownHeading ?? target)))
    shownHeading = (shownHeading ?? target) + turn
    markerEl.style.setProperty('--heading', `${shownHeading}rad`)
  }

  geolocation.on('change', () => {
    const position = geolocation.getPosition()
    if (position == null) return

    if (markerEl == null) {
      markerEl = document.createElement('div')
      markerEl.className = 'geolocation-marker'
      const cone = document.createElement('div')
      cone.className = 'geolocation-marker__heading'
      markerEl.append(cone)
      geolocationOverlay.setElement(markerEl)
    }

    geolocationOverlay.setPosition(position)
    applyHeading()
    callbacks.setError(undefined)

    // The camera decides whether this fix moves the view, and by how much.
    callbacks.onFix(position)
  })

  geolocation.on('error', (event) => {
    callbacks.setError(event.code)
    callbacks.onFollowEnded()
    // Required, not redundant: OL only re-arms watchPosition when TRACKING
    // changes value. Left true, the retry click's setTracking(true) is a silent no-op.
    geolocation.setTracking(false)
  })

  // The map can be rotated (pinch / alt+shift-drag), which moves north under the cone.
  mapInstance.getView().on('change:rotation', applyHeading)

  // Reuse an already-granted permission: resume tracking on (re)mount without re-prompting.
  // Querying the Permissions API never shows a prompt.
  void navigator.permissions
    ?.query({ name: 'geolocation' })
    .then((status) => {
      if (status.state !== 'granted') return
      // Shows the marker only. The reader did not ask for this, so it never claims the camera.
      geolocation.setTracking(true)
    })
    .catch(() => {})

  return () => {
    mapInstance.getView().un('change:rotation', applyHeading)
    geolocation.setTracking(false)
  }
}
