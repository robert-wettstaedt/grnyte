import { ascentQueue } from '$lib/entities/ascent/queue'
import type { QueueEntry } from './queue'

/** The mutators a PowerSync build queues on the device instead of sending at once, by name. Each one must
 *  deduplicate on a key in its args: an intent may be sent after the server forgot its write id. */
export const queueable: Record<string, QueueEntry<never>> = {
  'ascents.create': ascentQueue as QueueEntry<never>,
}
