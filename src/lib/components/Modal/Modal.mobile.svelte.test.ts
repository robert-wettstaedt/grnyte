import { render, waitFor } from '@testing-library/svelte'
import { createRawSnippet } from 'svelte'
import { expect, it, vi } from 'vitest'
import Mobile from './Modal.mobile.svelte'

vi.hoisted(() => {
  window.matchMedia = (() => ({ addEventListener() {}, matches: false, removeEventListener() {} })) as never
  // jsdom has no WAAPI, and a sheet only unmounts once its outro finishes.
  Element.prototype.animate = (() => {
    const animation = { cancel() {}, onfinish: null as (() => void) | null }
    setTimeout(() => animation.onfinish?.())
    return animation
  }) as never
})

vi.stubGlobal(
  'ResizeObserver',
  class {
    disconnect() {}
    observe() {}
  },
)

const children = createRawSnippet(() => ({
  render: () => '<div><button id="self-removing" type="button">Pick</button></div>',
  setup: (root) => {
    const button = root.querySelector('button')
    button?.addEventListener('click', () => button.remove())
  },
}))

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const sheetRendered = () => waitFor(() => expect(document.querySelector('.bottom-sheet')).not.toBeNull())

async function expectPressKeepsSheetOpen() {
  const button = document.querySelector<HTMLButtonElement>('#self-removing')
  expect(button).not.toBeNull()

  button?.click()
  await wait(50)

  expect(document.querySelector('#self-removing')).toBeNull()
  expect(document.querySelector('.bottom-sheet')).not.toBeNull()
}

// The library only starts listening for outside clicks 100ms after it opens.
async function openSheet() {
  render(Mobile, { children, open: true, title: 'Sheet' })
  await sheetRendered()
  await wait(150)
}

it('stays open when a control inside removes itself on click', async () => {
  await openSheet()

  await expectPressKeepsSheetOpen()
})

it('stays open on that press after reopening from a close inside the 100ms', async () => {
  const view = render(Mobile, { children, open: true, title: 'Sheet' })
  await sheetRendered()
  await view.rerender({ open: false })
  await wait(150)

  await view.rerender({ open: true })
  await sheetRendered()
  await wait(150)

  await expectPressKeepsSheetOpen()
})

it('still closes when a control outside removes itself on click', async () => {
  await openSheet()
  const outside = document.body.appendChild(document.createElement('button'))
  outside.addEventListener('click', () => outside.remove())

  outside.click()

  await waitFor(() => expect(document.querySelector('.bottom-sheet')).toBeNull())
})

it('still closes on a click outside', async () => {
  await openSheet()

  document.body.click()

  await waitFor(() => expect(document.querySelector('.bottom-sheet')).toBeNull())
})
