import { isAuthoredMessage } from '$lib/forms/issue'
import { formError } from '$lib/forms/schemas'
import type { MutationResult } from '$lib/remote/mutation'

// What both engines' `write` answer and throw. No Zero client here: the PowerSync build imports it.

export interface WriteOptions<T> {
  redirectTo?: ((data: T) => string) | string
}

/** What a refused write throws: Kit's `HttpError` shape, so `notifyError` and `withUndo` read it
 *  as they read a rejected remote command, plus the field the refusal concerns. */
export type WriteRejection = { body: { field?: null | string; message: string }; offline?: true }

export const answered = <T>(data: T, opts: undefined | WriteOptions<T>): MutationResult<T> => ({
  data,
  redirectTo: typeof opts?.redirectTo === 'function' ? opts.redirectTo(data) : opts?.redirectTo,
})

/** Shows `message` only when we wrote it: anything else can be a TypeError's text, or Zero's. */
export const refusal = (message?: string, field?: null | string): WriteRejection =>
  message != null && isAuthoredMessage(message)
    ? { body: { field, message } }
    : { body: { field, message: formError('error_server_title') } }

/** What any write throws when it never reached the server. */
export const offlineRejection: WriteRejection = {
  body: { field: undefined, message: formError('error_offline_title') },
  offline: true,
}
