import { expect, it } from 'vitest'
import { authorName } from './displayName'

it('names an author who deleted their account', () => {
  expect(authorName(null, undefined)).toBe('Deleted user')
})

it('stays empty while a live author has not synced, which is what the loading avatar reads', () => {
  expect(authorName(4, undefined)).toBe('')
})

it('uses the username once the author row is here', () => {
  expect(authorName(4, { username: 'ada' })).toBe('ada')
})
