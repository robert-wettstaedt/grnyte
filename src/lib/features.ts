export const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
export const isIOSSafari = isIOS && /WebKit/i.test(navigator.userAgent) && !/CriOS/i.test(navigator.userAgent)
export const isAndroid = /Android/.test(navigator.userAgent)

export const getNavigationUrl = (lat: number, long: number): string => {
  const coords = `${lat},${long}`
  if (isIOS) return `maps://maps.apple.com/?q=${coords}`
  if (isAndroid) return `geo:${coords}`
  return `https://www.google.com/maps?q=${coords}`
}
