import { notificationSourceType } from '$lib/db/schema'
import { describe, expect, it } from 'vitest'
import { OUTLIVES_MEMBERSHIP, QUEUE_ONLY, sourceTraits } from './sourceType'

const where = (pick: (type: (typeof notificationSourceType)[number]) => boolean) =>
  notificationSourceType.filter(pick).sort()

describe('sourceTraits', () => {
  it('keeps the queue-only pair exactly, since the inbox query hash includes it', () => {
    expect(QUEUE_ONLY).toEqual(['invitation_received', 'membership_removed'])
  })

  // The notifications SELECT policy is built from this list, so a third type widens RLS too.
  it('lets only the removal notices past a region the reader left', () => {
    expect(OUTLIVES_MEMBERSHIP).toEqual(['content_removed', 'content_restored'])
  })

  it('stores no actor on a removal or a report notice', () => {
    expect(where((type) => sourceTraits(type).anonymous)).toEqual([
      'content_removed',
      'content_reported',
      'content_restored',
      'report_closed',
    ])
  })

  it('lets only video_ready notify its own actor', () => {
    expect(where((type) => sourceTraits(type).selfAddressed)).toEqual(['video_ready'])
  })
})

describe('sourceTraits for a type this build does not know', () => {
  it('behaves as an ordinary row rather than throwing', () => {
    expect(sourceTraits('from_a_newer_build' as never)).toEqual({
      anonymous: false,
      outlivesMembership: false,
      push: 'directed',
      queueOnly: false,
      row: true,
      selfAddressed: false,
    })
  })
})
