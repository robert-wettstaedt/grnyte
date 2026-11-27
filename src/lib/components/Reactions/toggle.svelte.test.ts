import type { ReactionChip } from '$lib/entities/reaction/dto'
import { flushSync } from 'svelte'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createReactionToggle } from './toggle.svelte'

const read = $state({ chips: [] as ReactionChip[], eventId: 1 })
const answers: { reject: (cause: unknown) => void; resolve: (held: boolean) => void }[] = []

vi.mock('$lib/entities/reaction/writes', () => ({
  toggleReaction: () =>
    new Promise((resolve, reject) =>
      answers.push({ reject, resolve: (held: boolean) => resolve({ data: held, redirectTo: undefined }) }),
    ),
}))
vi.mock('$lib/state/global.svelte', () => ({ getGlobalState: () => ({ user: { id: 1, username: 'ada' } }) }))

const chip = (emoji: string, names: string[], mine = false): ReactionChip => ({
  count: names.length,
  emoji,
  mine,
  names,
})

/** Lets a settled answer reach the toggle's `await`. */
const settle = async () => {
  await Promise.resolve()
  await Promise.resolve()
  flushSync()
}

let reaction: ReturnType<typeof createReactionToggle>
let cleanup: () => void

beforeEach(() => {
  read.chips = [chip('🔥', ['mara'])]
  read.eventId = 1
  answers.length = 0
  cleanup = $effect.root(() => {
    reaction = createReactionToggle(
      () => ({ eventId: read.eventId }),
      () => read.chips,
    )
  })
  flushSync()
})

afterEach(() => cleanup())

it('shows the tapped emoji while the toggle is out', () => {
  void reaction.toggle('🔥')
  flushSync()

  expect(reaction.chips).toEqual([chip('🔥', ['mara', 'ada'], true)])
})

it('shows the read at once when the toggle is refused', async () => {
  void reaction.toggle('🔥')
  answers[0].reject(new Error('refused'))
  await settle()

  expect(reaction.chips).toEqual([chip('🔥', ['mara'])])
})

it("shows the server's answer after a tap on a read that missed the reader's emoji", async () => {
  void reaction.toggle('🔥')
  answers[0].resolve(false)
  await settle()

  expect(reaction.chips).toEqual([chip('🔥', ['mara'])])
})

it('follows the read once it agrees with the answer', async () => {
  void reaction.toggle('🔥')
  answers[0].resolve(true)
  await settle()
  read.chips = [chip('🔥', ['mara', 'ada'], true)]
  flushSync()
  // Taken back on another device, after this one's choice already synced.
  read.chips = [chip('🔥', ['mara'])]
  flushSync()

  expect(reaction.chips).toEqual([chip('🔥', ['mara'])])
})

it("shows another target's own read, not the choice made on the first", () => {
  void reaction.toggle('🔥')
  read.eventId = 2
  read.chips = [chip('💪', ['tom'])]
  flushSync()

  expect(reaction.chips).toEqual([chip('💪', ['tom'])])
})

it('keeps showing the answer while the read has not caught up', async () => {
  void reaction.toggle('🔥')
  answers[0].resolve(true)
  await settle()

  expect(reaction.chips).toEqual([chip('🔥', ['mara', 'ada'], true)])
})

it('clears the emoji the reader holds when they tap it', () => {
  read.chips = [chip('🔥', ['mara', 'ada'], true)]
  flushSync()
  void reaction.toggle('🔥')
  flushSync()

  expect(reaction.chips).toEqual([chip('🔥', ['mara'])])
})

it('takes a second tap from the chips shown, before the read caught up', async () => {
  void reaction.toggle('🔥')
  answers[0].resolve(true)
  await settle()
  void reaction.toggle('🔥')
  flushSync()

  expect(reaction.chips).toEqual([chip('🔥', ['mara'])])
})

it('shows a read that agrees before the answer unchanged', () => {
  void reaction.toggle('🔥')
  // The Zero build's stand-in row, landed while the write is out.
  read.chips = [chip('🔥', ['mara', 'ada'], true)]
  flushSync()

  expect(reaction.chips).toEqual([chip('🔥', ['mara', 'ada'], true)])
})

it('forgets a choice on one target once the bar shows another', async () => {
  void reaction.toggle('🔥')
  answers[0].resolve(true)
  await settle()
  read.eventId = 2
  flushSync()
  read.eventId = 1
  flushSync()

  expect(reaction.chips).toEqual([chip('🔥', ['mara'])])
})
