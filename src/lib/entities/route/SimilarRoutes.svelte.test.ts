import '$lib/components/Modal/sheetTestEnv'
import { m } from '$lib/paraglide/messages'
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { createRawSnippet, flushSync } from 'svelte'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { RouteListItem } from './dto'
import type { SimilarRoute } from './similarMatches.svelte'
import SimilarRoutes from './SimilarRoutes.svelte'

const fake = vi.hoisted(() => ({ rows: [] as SimilarRoute[] }))

vi.mock('./similarMatches.svelte', () => ({ similarRoutes: () => ({ rows: fake.rows }) }))
vi.mock('$app/navigation', () => ({ beforeNavigate() {} }))
vi.mock('$lib/state/global.svelte', () => ({
  getGlobalState: () => ({ grades: [], gradingScale: 'FB', userRegions: [] }),
}))
vi.mock('$lib/state/motion.svelte', () => ({ motion: () => 0, prefersStill: () => true }))
// Renders its text: a silent stub would let "the row leaves the description out" pass whatever the row does.
vi.mock('$lib/components/Markdown/Markdown.svelte', () => ({
  default: (anchor: Comment, props: { markdown: string }) => anchor.before(props.markdown),
}))

const route = (id: number, name: string, extra: Partial<RouteListItem> = {}) =>
  ({
    areaName: 'Sector A',
    blockFk: 3,
    blockName: 'Block 3',
    description: 'A long description',
    id,
    name,
    rating: 0,
    tags: [],
    ...extra,
  }) as unknown as RouteListItem

const similar = (over: Partial<SimilarRoute> & { route: RouteListItem }): SimilarRoute => ({
  id: over.route.id,
  kind: 'typo',
  place: 'region',
  ...over,
})

const block = { areaFk: 10, id: 1, regionFk: 2 }
const props = { block, focused: true, name: 'Karma' }

// The sheet's chunk loads on first render, and compiling it can outlast `findBy`'s timeout.
beforeAll(() => import('$lib/components/Modal/Modal.mobile.svelte'), 30_000)

afterEach(() => {
  fake.rows = []
})

describe('SimilarRoutes', () => {
  it('adds nothing to the form when there is no match', () => {
    const { container } = render(SimilarRoutes, props)

    expect(screen.queryByText(m.routes_form_similarHeading())).toBeNull()
    expect(container.querySelector('button')).toBeNull()
    expect(screen.getByRole('status').textContent?.trim()).toBe('')
  })

  it('lists matches under the heading, with where they are and without their description', () => {
    fake.rows = [similar({ route: route(7, 'Karrma') })]

    render(SimilarRoutes, props)

    expect(screen.getByText(m.routes_form_similarHeading())).toBeTruthy()
    const row = screen.getByRole('button', { name: /Karrma/ })
    expect(row.textContent).toContain('Sector A')
    expect(row.textContent).toContain('Block 3')
    expect(row.textContent).not.toContain('A long description')
    expect(row.getAttribute('type')).toBe('button')
    expect(screen.getByRole('status').textContent).toContain(m.routes_form_similarAnnouncement())
  })

  it('states an exact match on this block in place of the heading', () => {
    fake.rows = [similar({ kind: 'exact', place: 'block', route: route(7, 'Karma') })]

    render(SimilarRoutes, props)

    const line = m.routes_form_similarExact({ name: 'Karma' })
    expect(screen.queryByText(m.routes_form_similarHeading())).toBeNull()
    expect(screen.getByRole('status').textContent).toContain(line)
  })

  it.each([
    ['another block', { kind: 'exact', place: 'sector' }],
    ['a typo on this block', { kind: 'typo', place: 'block' }],
  ] as const)('keeps the heading for %s', (_label, match) => {
    fake.rows = [similar({ ...match, route: route(7, 'Karma') })]

    render(SimilarRoutes, props)

    expect(screen.getByText(m.routes_form_similarHeading())).toBeTruthy()
  })

  it('opens a preview with the route link and its tags', async () => {
    fake.rows = [similar({ route: route(7, 'Karrma', { tags: ['SD'] }) })]

    render(SimilarRoutes, props)
    await fireEvent.click(screen.getByRole('button', { name: /Karrma/ }))

    const details = await screen.findByRole('link', { name: m.routes_showDetails() })
    expect(details.getAttribute('href')).toBe('/routes/7')
    expect(screen.getByText('SD')).toBeTruthy()
    expect(document.body.textContent).toContain('A long description')
  })

  it('names the route once in the preview, with where it is and its first ascent year', async () => {
    fake.rows = [similar({ route: route(7, 'Karrma', { firstAscentYear: 1998 }) })]

    render(SimilarRoutes, props)
    await fireEvent.click(screen.getByRole('button', { name: /Karrma/ }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent?.split('Karrma').length).toBe(2)
    expect(dialog.textContent).toContain('Block 3')
    expect(dialog.textContent).toContain('1998')
  })

  it.each([
    ['a drawn route', [{ id: 'p1', type: 'start', x: 0.1, y: 0.9 }], 1],
    ['an undrawn route', [], 0],
  ] as const)('shows the topo for %s only when drawn', async (_label, topoPoints, count) => {
    const topo = { topoImageHeight: 600, topoImagePath: 'topos/1.jpg', topoImageWidth: 800 }
    fake.rows = [similar({ route: route(7, 'Karrma', { ...topo, topoPoints: [...topoPoints] }) })]

    render(SimilarRoutes, props)
    await fireEvent.click(screen.getByRole('button', { name: /Karrma/ }))
    await screen.findByRole('dialog')

    expect(screen.queryAllByRole('img', { name: m.topo_alt() })).toHaveLength(count)
  })

  const useAction = createRawSnippet<[RouteListItem, () => void]>((item) => ({
    render: () => `<button type="button">Use ${item().id}</button>`,
  }))

  it('offers the action it is given instead of the route link', async () => {
    fake.rows = [similar({ route: route(7, 'Karrma') })]

    render(SimilarRoutes, { ...props, similar: { action: useAction, offers: () => true } })
    await fireEvent.click(screen.getByRole('button', { name: /Karrma/ }))

    await screen.findByRole('button', { name: 'Use 7' })
    expect(screen.queryByRole('link', { name: m.routes_showDetails() })).toBeNull()
  })

  it('offers neither the action nor the link for a route the action does not apply to', async () => {
    fake.rows = [similar({ route: route(7, 'Karrma') })]

    render(SimilarRoutes, { ...props, similar: { action: useAction, offers: () => false } })
    await fireEvent.click(screen.getByRole('button', { name: /Karrma/ }))
    await screen.findByRole('dialog')

    expect(screen.queryByRole('button', { name: 'Use 7' })).toBeNull()
    expect(screen.queryByRole('link', { name: m.routes_showDetails() })).toBeNull()
  })

  it('hands the action a way to close the preview', async () => {
    fake.rows = [similar({ route: route(7, 'Karrma') })]
    const action = createRawSnippet<[RouteListItem, () => void]>((_item, close) => ({
      render: () => '<button type="button">Use it</button>',
      setup: (element) => {
        element.addEventListener('click', () => close()())
      },
    }))

    render(SimilarRoutes, { ...props, similar: { action, offers: () => true } })
    await fireEvent.click(screen.getByRole('button', { name: /Karrma/ }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Use it' }))
    flushSync()

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Use it' })).toBeNull())
  })
})
