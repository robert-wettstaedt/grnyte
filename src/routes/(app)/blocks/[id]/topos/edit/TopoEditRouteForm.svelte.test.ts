import type { BlockDetail } from '$lib/entities/block/dto'
import type { RouteDetail } from '$lib/entities/route/dto'
import { refusal } from '$lib/zero/writeResult'
import { fireEvent, render, screen } from '@testing-library/svelte'
import { expect, it, vi } from 'vitest'
import TopoEditRouteForm from './TopoEditRouteForm.svelte'

vi.mock('$lib/state/online.svelte', () => ({ isOnline: () => true }))
vi.mock('$lib/state/toast/toast', () => ({ FAILURE_TOAST_MS: 0, toaster: { create: vi.fn() } }))
vi.mock('$lib/entities/route/RouteFormFields.svelte', () => ({ default: () => {} }))
vi.mock('$lib/entities/route/editSeed', () => ({ routeEditSeed: () => ({ blockId: '3', name: 'Karma' }) }))
vi.mock('$lib/entities/route/writes', () => ({ updateRoute: () => Promise.reject(refusal()) }))

it('scrolls a refusal into view and stays open', async () => {
  const scroll = vi.fn()
  Element.prototype.scrollIntoView = scroll
  const onSaved = vi.fn()
  const { container } = render(TopoEditRouteForm, {
    block: {} as BlockDetail,
    onSaved,
    route: {} as RouteDetail,
  })

  await fireEvent.submit(container.querySelector('form')!)
  await vi.waitFor(() => expect(scroll).toHaveBeenCalled())

  expect(scroll.mock.contexts[0]).toBe(screen.getByRole('alert'))
  expect(onSaved).not.toHaveBeenCalled()
})
