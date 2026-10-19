import { isOnline } from '$lib/state/online.svelte'
import { offlineRejection, type WriteRejection } from '$lib/zero/write'
import { isAuthoredMessage } from './issue'
import { formError } from './schemas'

/** A remote command as a store form's `submit`: refused offline like `write`, and a fetch that
 *  never answered reads as offline. A refusal's `HttpError` is already a `WriteRejection`. */
export async function submitCommand<T>(run: () => Promise<T>): Promise<T> {
  if (!isOnline()) throw offlineRejection
  try {
    return await run()
  } catch (cause) {
    if (cause instanceof TypeError || !isOnline()) throw offlineRejection
    // Like `write`: only our own messages reach the form, never a 500's generic text.
    const body = (cause as Partial<WriteRejection>)?.body
    if (body != null && !isAuthoredMessage(body.message)) throw { body: { message: formError('error_server_title') } }
    throw cause
  }
}
