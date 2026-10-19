import { isOnline } from '$lib/state/online.svelte'
import { offlineRejection } from '$lib/zero/write'

/** A remote command as a store form's `submit`: refused offline like `write`, and a fetch that
 *  never answered reads as offline. A refusal's `HttpError` is already a `WriteRejection`. */
export async function submitCommand<T>(run: () => Promise<T>): Promise<T> {
  if (!isOnline()) throw offlineRejection
  try {
    return await run()
  } catch (cause) {
    throw cause instanceof TypeError || !isOnline() ? offlineRejection : cause
  }
}
