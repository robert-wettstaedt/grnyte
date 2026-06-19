import { reportClientError } from '$lib/logging/report'
import type { HandleClientError } from '@sveltejs/kit'

// Unexpected errors during load / navigation / rendering. Not called for expected
// `error()` throws (404s etc.), which the +error.svelte boundary already handles.
export const handleError: HandleClientError = ({ error }) => {
  reportClientError(error)
  return { message: 'Something went wrong' }
}

// The gap nothing else covers: throws in event handlers, timers, and rejected
// promises never reach handleError or a <svelte:boundary>.
window.addEventListener('unhandledrejection', (event) => reportClientError(event.reason))
window.addEventListener('error', (event) => {
  // Only real JS exceptions carry `error`; resource-load failures (img/script/css)
  // fire here too with no error object — ignore those to keep the log clean.
  if (event.error != null) reportClientError(event.error)
})
