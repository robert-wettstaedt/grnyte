import { expect, it } from 'vitest'
import { reportMailto } from './mailto'

const origin = 'https://grnyte.test'

it('puts one of our addresses in the mail', () => {
  expect(reportMailto('report@grnyte.test', `${origin}/f/abc`, origin)).toBe(
    'mailto:report@grnyte.test?body=https%3A%2F%2Fgrnyte.test%2Ff%2Fabc',
  )
})

it('takes a path as one of ours', () => {
  expect(reportMailto('report@grnyte.test', '/routes/5', origin)).toBe(
    'mailto:report@grnyte.test?body=https%3A%2F%2Fgrnyte.test%2Froutes%2F5',
  )
})

it('leaves out an address that is not ours, or none at all', () => {
  expect(reportMailto('report@grnyte.test', 'https://evil.test/x', origin)).toBe('mailto:report@grnyte.test')
  expect(reportMailto('report@grnyte.test', null, origin)).toBe('mailto:report@grnyte.test')
})
