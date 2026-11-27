import { describe, expect, it } from 'vitest'
import type { ReactionChip } from './dto'
import { withOwnEmoji } from './mapper'

const chip = (emoji: string, names: string[], mine = false): ReactionChip => ({
  count: names.length,
  emoji,
  mine,
  names,
})

describe('withOwnEmoji', () => {
  it("adds the reader to a chip others hold, with their name after the others'", () => {
    expect(withOwnEmoji([chip('🔥', ['mara'])], '🔥', 'ada')).toEqual([chip('🔥', ['mara', 'ada'], true)])
  })

  it('appends a new emoji after the chips already there', () => {
    expect(withOwnEmoji([chip('🔥', ['mara'])], '💪', 'ada')).toEqual([chip('🔥', ['mara']), chip('💪', ['ada'], true)])
  })

  it("moves the reader's mark, count and name from the emoji they held to the new one", () => {
    expect(withOwnEmoji([chip('🔥', ['mara', 'ada'], true), chip('💪', ['tom'])], '💪', 'ada')).toEqual([
      chip('🔥', ['mara']),
      chip('💪', ['tom', 'ada'], true),
    ])
  })

  it("clears the reader's emoji, and drops a chip only they held", () => {
    expect(withOwnEmoji([chip('🔥', ['mara', 'ada'], true)], undefined, 'ada')).toEqual([chip('🔥', ['mara'])])
    expect(withOwnEmoji([chip('🔥', ['mara']), chip('💪', ['ada'], true)], undefined, 'ada')).toEqual([
      chip('🔥', ['mara']),
    ])
  })

  it('leaves chips that already agree as they are', () => {
    const agreed = [chip('🔥', ['mara', 'ada'], true), chip('💪', ['tom'])]
    expect(withOwnEmoji(agreed, '🔥', 'ada')).toEqual(agreed)
    expect(withOwnEmoji([chip('💪', ['tom'])], undefined, 'ada')).toEqual([chip('💪', ['tom'])])
  })

  it("keeps another member's name when the reader shares their display name", () => {
    expect(withOwnEmoji([chip('🔥', ['ada', 'mara', 'ada'], true)], undefined, 'ada')).toEqual([
      chip('🔥', ['ada', 'mara']),
    ])
  })
})
