import { createFormStore } from '$lib/forms/store.svelte'
import { render } from '@testing-library/svelte'
import { expect, it, vi } from 'vitest'
import type { BlockDetail } from '../block/dto'
import { routeActionSchema, type RouteDetail } from './dto'
import RouteFormFields from './RouteFormFields.svelte'

vi.mock('$lib/state/global.svelte', () => ({
  getGlobalState: () => ({ grades: [], gradingScale: 'FB', userRegions: [] }),
}))
vi.mock('$lib/state/motion.svelte', () => ({ motion: () => 0, prefersStill: () => true }))
// Zero-backed or editor-heavy, and none of them holds one of the four values under test.
vi.mock('$lib/components/Breadcrumb/Breadcrumb.svelte', () => ({ default: () => {} }))
vi.mock('$lib/components/MarkdownEditor/MarkdownEditor.svelte', () => ({ default: () => {} }))
vi.mock('$lib/entities/firstAscensionist/FirstAscentField.svelte', () => ({ default: () => {} }))
vi.mock('$lib/components/MediaDropZone/MediaDropZone.svelte', () => ({ default: () => {} }))
vi.stubGlobal('matchMedia', () => ({ addEventListener() {}, matches: false, removeEventListener() {} }))

const block = { areas: [], id: 3, name: 'Boulder 23', regionFk: 2 } as unknown as BlockDetail
const route = {
  firstAscents: [{ name: 'Alex', userFk: 9 }],
  rawGradeFk: 6,
  rawRating: 3,
  tags: ['SD'],
} as unknown as RouteDetail

it('holds the values no text input owns in the store it submits from', async () => {
  const form = createFormStore(routeActionSchema)

  render(RouteFormFields, { block, form, route })
  await vi.waitFor(() => expect(form.fields.value().tags).toEqual(['SD']))

  expect(form.fields.value()).toMatchObject({
    firstAscensionists: [{ name: 'Alex', userFk: '9' }],
    gradeFk: '6',
    rating: '3',
    tags: ['SD'],
  })
})
