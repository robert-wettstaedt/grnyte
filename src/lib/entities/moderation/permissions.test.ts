import { expect, it } from 'vitest'
import { offersRemovalChoice } from './permissions'

const member = (permissions: string[]) => [{ permissions, regionFk: 1 }] as never

it.each([
  ['a maintainer', ['region.read', 'region.edit'], false, false],
  ['a member', ['region.read'], false, false],
  ['an admin, on somebody else s', ['region.read', 'region.edit', 'region.delete'], false, true],
  ['an admin, on their own ascent or media', ['region.read', 'region.edit', 'region.delete'], true, false],
])('offers %s the choice: %s', (_, permissions, ownLeaf, expected) => {
  expect(offersRemovalChoice(member(permissions), 1, ownLeaf)).toBe(expected)
})

it('offers nothing in a region the admin does not run', () => {
  expect(offersRemovalChoice(member(['region.read', 'region.edit', 'region.delete']), 2)).toBe(false)
})
