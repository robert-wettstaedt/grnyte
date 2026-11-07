import { createFormStore } from '$lib/forms/store.svelte'
import { fireEvent, render } from '@testing-library/svelte'
import { flushSync } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BlockDetail } from '../block/dto'
import { routeActionSchema, type RouteDetail } from './dto'
import RouteFormFields from './RouteFormFields.svelte'

const similar = vi.hoisted(() => ({ props: undefined as undefined | { focused: boolean; name: string } }))

vi.mock('$lib/state/global.svelte', () => ({
  getGlobalState: () => ({ grades: [], gradingScale: 'FB', userRegions: [] }),
}))
vi.mock('$lib/state/motion.svelte', () => ({ motion: () => 0, prefersStill: () => true }))
// Zero-backed or editor-heavy, and none of them holds one of the four values under test.
vi.mock('$lib/components/Breadcrumb/Breadcrumb.svelte', () => ({ default: () => {} }))
vi.mock('$lib/components/MarkdownEditor/MarkdownEditor.svelte', () => ({ default: () => {} }))
vi.mock('$lib/entities/firstAscensionist/FirstAscentField.svelte', () => ({ default: () => {} }))
vi.mock('$lib/components/MediaDropZone/MediaDropZone.svelte', () => ({ default: () => {} }))
vi.mock('./SimilarRoutes.svelte', () => ({
  default: (_anchor: unknown, props: { focused: boolean; name: string }) => {
    similar.props = props
  },
}))
vi.stubGlobal('matchMedia', () => ({ addEventListener() {}, matches: false, removeEventListener() {} }))

const block = { areas: [], id: 3, name: 'Boulder 23', regionFk: 2 } as unknown as BlockDetail
const route = {
  firstAscents: [{ name: 'Alex', userFk: 9 }],
  rawGradeFk: 6,
  rawRating: 3,
  tags: ['SD'],
} as unknown as RouteDetail

describe('similar routes', () => {
  afterEach(() => {
    similar.props = undefined
  })

  it('are offered while adding, following the name field', async () => {
    const form = createFormStore(routeActionSchema)
    const { container } = render(RouteFormFields, { block, form })
    const input = container.querySelector<HTMLInputElement>('input[name="name"]')!

    expect(similar.props).toMatchObject({ focused: false, name: '' })

    await fireEvent.focus(input)
    expect(similar.props?.focused).toBe(true)

    form.fields.name.set('Karma')
    flushSync()
    expect(similar.props?.name).toBe('Karma')

    await fireEvent.blur(input)
    expect(similar.props?.focused).toBe(false)
  })

  it('are not offered while editing', () => {
    render(RouteFormFields, { block, form: createFormStore(routeActionSchema), route })

    expect(similar.props).toBeUndefined()
  })
})

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
