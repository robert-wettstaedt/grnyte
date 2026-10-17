import { notificationSourceType } from '$lib/db/schema'
import { describe, expect, it } from 'vitest'
import { QUEUE_ONLY, sourceTraits } from './sourceType'

const where = (pick: (type: (typeof notificationSourceType)[number]) => boolean) =>
  notificationSourceType.filter(pick).sort()

describe('sourceTraits', () => {
  it('keeps the queue-only pair exactly, since the inbox query hash includes it', () => {
    expect(QUEUE_ONLY).toEqual(['invitation_received', 'membership_removed'])
  })

  it('draws no row for the sentence-only types', () => {
    expect(where((type) => !sourceTraits(type).row)).toEqual(
      ['ascent_deleted', 'invitation_received', 'invite_accepted', 'membership_removed', 'role_changed'].sort(),
    )
  })

  it('lets only video_ready notify its own actor', () => {
    expect(where((type) => sourceTraits(type).selfAddressed)).toEqual(['video_ready'])
  })

  it('gates reactions and comments on their own switches, the rest on the directed one', () => {
    expect(where((type) => sourceTraits(type).push === 'reactions')).toEqual(['reaction'])
    expect(where((type) => sourceTraits(type).push === 'comments')).toEqual(['comment', 'comment_reply'])
  })
})

describe('sourceTraits for a type this build does not know', () => {
  it('behaves as an ordinary row rather than throwing', () => {
    expect(sourceTraits('from_a_newer_build' as never)).toEqual({
      push: 'directed',
      queueOnly: false,
      row: true,
      selfAddressed: false,
    })
  })
})
