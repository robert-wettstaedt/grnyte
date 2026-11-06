import { expect, it } from 'vitest'
import { isMediaKeyExempt, mediaKeyAction } from './keys'

const press = (key: string, init: KeyboardEventInit = {}, target: HTMLElement = document.body) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, key, ...init })
  Object.defineProperty(event, 'target', { value: target })
  return event
}
const playing = { canStep: false, sheetOpen: false }
const paused = { canStep: true, sheetOpen: false }
const element = (html: string) => {
  const host = document.createElement('div')
  host.innerHTML = html
  return host.firstElementChild as HTMLElement
}

it.each([
  [' ', 'togglePlay'],
  ['k', 'togglePlay'],
  ['K', 'togglePlay'],
  ['m', 'toggleMute'],
  ['ArrowLeft', 'seekBack'],
  ['ArrowRight', 'seekForward'],
  ['<', 'slower'],
  ['>', 'faster'],
])('maps %s to %s', (key, action) => {
  expect(mediaKeyAction(press(key), playing)).toBe(action)
})

it('steps only while paused', () => {
  expect(mediaKeyAction(press(','), paused)).toBe('stepBack')
  expect(mediaKeyAction(press('.'), paused)).toBe('stepForward')
  expect(mediaKeyAction(press(','), playing)).toBeNull()
  expect(mediaKeyAction(press('.'), playing)).toBeNull()
})

it('leaves paging keys and anything unmapped alone', () => {
  expect(mediaKeyAction(press('j'), playing)).toBeNull()
  expect(mediaKeyAction(press('l'), playing)).toBeNull()
  expect(mediaKeyAction(press('x'), playing)).toBeNull()
})

it('lets Space activate a focused button or link, and only Space', () => {
  expect(mediaKeyAction(press(' ', {}, element('<button></button>')), playing)).toBeNull()
  expect(mediaKeyAction(press(' ', {}, element('<a href="/x"></a>')), playing)).toBeNull()
  expect(mediaKeyAction(press('k', {}, element('<button></button>')), playing)).toBe('togglePlay')
})

it('fires nothing while typing in a field', () => {
  for (const html of ['<input type="text">', '<textarea></textarea>', '<div contenteditable></div>']) {
    expect(mediaKeyAction(press('m', {}, element(html)), playing)).toBeNull()
  }
})

it('leaves only the arrows to a focused seek bar', () => {
  const slider = element('<input type="range">')

  expect(mediaKeyAction(press('ArrowLeft', {}, slider), playing)).toBeNull()
  expect(mediaKeyAction(press('ArrowRight', {}, slider), playing)).toBeNull()
  expect(mediaKeyAction(press(' ', {}, slider), playing)).toBe('togglePlay')
  expect(mediaKeyAction(press('m', {}, slider), playing)).toBe('toggleMute')
})

it('does not repeat a toggle while its key is held', () => {
  for (const key of [' ', 'k', 'm']) {
    expect(mediaKeyAction(press(key, { repeat: true }), playing)).toBeNull()
  }
})

it('repeats seeking, stepping and speed while their key is held', () => {
  expect(mediaKeyAction(press('ArrowRight', { repeat: true }), playing)).toBe('seekForward')
  expect(mediaKeyAction(press('.', { repeat: true }), paused)).toBe('stepForward')
  expect(mediaKeyAction(press('>', { repeat: true }), playing)).toBe('faster')
})

it('fires nothing while a sheet is open', () => {
  expect(mediaKeyAction(press('m'), { canStep: false, sheetOpen: true })).toBeNull()
})

// Paging keys use this too, so `j` and `l` work on a tabbed-to seek bar, as `k` and `m` do.
it('does not treat a focused seek bar as typing, but does a text field or a browser shortcut', () => {
  expect(isMediaKeyExempt(press('l', {}, element('<input type="range">')))).toBe(false)
  expect(isMediaKeyExempt(press('l', {}, element('<input type="text">')))).toBe(true)
  expect(isMediaKeyExempt(press('l', { metaKey: true }))).toBe(true)
  expect(isMediaKeyExempt(press('l'))).toBe(false)
})

it('leaves browser shortcuts alone', () => {
  expect(mediaKeyAction(press('k', { metaKey: true }), playing)).toBeNull()
  expect(mediaKeyAction(press('m', { ctrlKey: true }), playing)).toBeNull()
  expect(mediaKeyAction(press('ArrowLeft', { altKey: true }), playing)).toBeNull()
})
