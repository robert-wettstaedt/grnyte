export const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
export const isIOSSafari = isIOS && /WebKit/i.test(navigator.userAgent) && !/CriOS/i.test(navigator.userAgent)
export const isAndroid = /Android/.test(navigator.userAgent)
