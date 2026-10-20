import { fireEvent, render } from '@testing-library/svelte'
import { expect, it, vi } from 'vitest'
import FirstAscentField from './FirstAscentField.svelte'

// German, so "me" has to come from the locale rather than the English word.
vi.mock('$lib/paraglide/messages', async (original) => {
  const { m } = await original<typeof import('$lib/paraglide/messages')>()
  return { m: { ...m, common_me: () => 'Ich' } }
})
vi.mock('$lib/state/global.svelte', () => ({ getGlobalState: () => ({ user: { id: 7, username: 'climber' } }) }))
vi.mock('$lib/state/motion.svelte', () => ({ motion: () => 0 }))
vi.mock('$lib/state/pill.svelte', () => ({ quietly: (build: () => unknown) => build() }))
vi.mock('./resources.svelte', () => ({
  firstAscensionistList: () => ({
    data: [
      { id: 1, name: 'Alex Honnold', userFk: undefined },
      { id: 2, name: 'Lynn', userFk: 9, username: 'lhill' },
    ],
    phase: { kind: 'answered' },
  }),
}))

const typed = async (text: string) => {
  const { container } = render(FirstAscentField, { regionFk: 2 })
  const input = container.querySelector<HTMLInputElement>('input[type="text"]')!
  await fireEvent.input(input, { target: { value: text } })
  const prevented = !(await fireEvent.keyDown(input, { key: 'Enter' }))
  const userFks = [...container.querySelectorAll<HTMLInputElement>('input[name$=".userFk"]')].map((el) => el.value)
  const names = [...container.querySelectorAll<HTMLInputElement>('input[name$=".name"]')].map((el) => el.value)
  return { input, names, prevented, userFks }
}

it('adds a new name on Enter instead of letting the form submit', async () => {
  const { input, names, prevented } = await typed('Lynn Hill')

  expect(prevented).toBe(true)
  expect(names).toEqual(['Lynn Hill'])
  expect(input.value).toBe('')
})

it('reuses the existing first ascensionist whose name was typed in full', async () => {
  expect((await typed('alex honnold')).names).toEqual(['Alex Honnold'])
})

it('leaves Enter alone on an empty field', async () => {
  expect((await typed('')).prevented).toBe(false)
})

it('links the signed-in user for the localized word for me', async () => {
  expect((await typed('ich')).userFks).toEqual(['7'])
})

it('reuses a linked first ascensionist whose username was typed', async () => {
  const { names, userFks } = await typed('lhill')
  expect(names).toEqual(['Lynn'])
  expect(userFks).toEqual(['9'])
})
