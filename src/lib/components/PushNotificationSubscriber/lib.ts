import { PUBLIC_APPLICATION_NAME, PUBLIC_VAPID_KEY } from '$env/static/public'

export const STORAGE_KEY = `[${PUBLIC_APPLICATION_NAME}].pushSubscriptionId`

export const isSupported = () => {
  return 'serviceWorker' in navigator && 'PushManager' in window
}

export const isSubscribed = async () => {
  // Check if the browser supports service workers and push notifications
  const supported = isSupported()

  if (!supported) {
    return false
  }

  // Check if already subscribed
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()

    return subscription != null && localStorage.getItem(STORAGE_KEY) != null
  } catch (error) {
    console.error('Error checking subscription status:', error)
    return false
  }
}

export const subscribe = async () => {
  // Check browser compatibility
  if (!isSupported()) {
    throw new Error('Push API is not supported by device')
  }

  // Check for permission
  const permissionResult = await Notification.requestPermission()
  if (permissionResult !== 'granted') {
    throw new Error('Permission not granted for notifications')
  }

  // Get service worker registration
  const registration = await navigator.serviceWorker.ready

  // Check if we already have a subscription
  let subscription = await registration.pushManager.getSubscription()

  if (subscription != null) {
    await subscription.unsubscribe()
  }

  // Convert base64 string to Uint8Array for the applicationServerKey
  const applicationServerKey = urlBase64ToUint8Array(PUBLIC_VAPID_KEY)

  // Create the subscription
  subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })

  const json = subscription?.toJSON()

  if (
    json?.endpoint == null ||
    json.endpoint.length === 0 ||
    json.keys?.p256dh == null ||
    json.keys?.p256dh.length === 0 ||
    json.keys.auth == null ||
    json.keys.auth.length === 0
  ) {
    throw new Error('Failed to subscribe to push notifications')
  }

  return {
    endpoint: json.endpoint,
    expirationTime: json.expirationTime,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  }
}

export const unsubscribe = async () => {
  // Check browser compatibility
  if (!isSupported()) {
    throw new Error('Push API is not supported by device')
  }

  // Get the current subscription
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()

  if (subscription != null) {
    // Unsubscribe from push manager
    await subscription.unsubscribe()
  }
}

// Helper function to convert base64 string to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  // Add padding if needed
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')

  // Decode base64
  const rawData = atob(base64)

  // Create output array and populate it
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray
}
