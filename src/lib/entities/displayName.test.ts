import { expect, it } from 'vitest'
import { toAuthor } from './displayName'

it('names an author who deleted their account, with no id to link to', () => {
  expect(toAuthor(null, undefined)).toEqual({ id: null, name: 'Deleted user' })
})

it('stays empty while a live author has not synced, which is what the loading avatar reads', () => {
  expect(toAuthor(4, undefined)).toEqual({ id: 4, name: '' })
})

it('uses the username once the author row is here', () => {
  expect(toAuthor(4, 'ada')).toEqual({ id: 4, name: 'ada' })
})
