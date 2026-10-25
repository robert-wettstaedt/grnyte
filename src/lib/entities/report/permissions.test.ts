import { expect, it } from 'vitest'
import { canReport } from './permissions'

const ME = 7
const OTHER = 8
const member = (permissions: string[]) => [{ permissions, regionFk: 1 }] as never

it.each([
  ['a member, on somebody else s', ['region.read'], OTHER, true],
  ['a maintainer, on somebody else s', ['region.read', 'region.edit'], OTHER, true],
  ['a member, on content whose author deleted their account', ['region.read'], null, true],
  ['an admin', ['region.read', 'region.edit', 'region.delete'], OTHER, false],
  ['the author', ['region.read'], ME, false],
  ['someone without read', [], OTHER, false],
])('lets %s report: %s', (_, permissions, authorFk, expected) => {
  expect(canReport(member(permissions), ME, { authorFk, regionFk: 1 })).toBe(expected)
})

it('refuses an outsider to the region', () => {
  expect(canReport(member(['region.read']), ME, { authorFk: OTHER, regionFk: 2 })).toBe(false)
})
