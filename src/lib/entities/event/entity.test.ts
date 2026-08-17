import { describe, expect, it } from 'vitest'
import { eventRefs } from './entity'
import { line } from './line.fixture'

/**
 * The four roles one pass answers. Each was its own collector, and each rule below is the reason
 * one of them existed: an invitation that must not hydrate its inviter, an upload that must name
 * what it landed on, a removed member who is fetched but not rendered, and the shared place a
 * burst headline names.
 */
describe('eventRefs', () => {
  it('lists each subject once, in the order the activities arrive', () => {
    expect(
      eventRefs([
        line({ id: 1, objectId: '2' }),
        line({ id: 2, objectId: '3' }),
        line({ id: 3, objectId: '2' }),
        line({ id: 4, objectId: '2', objectType: 'block' }),
      ]).subjects,
    ).toEqual([
      { id: '2', type: 'route' },
      { id: '3', type: 'route' },
      { id: '2', type: 'block' },
    ])
  })

  // An invitation names an address the invitee has no account for and points `entityId` at the
  // inviter, so hydrating it rendered "Jonas invited Jonas".
  it('leaves a stored subject out of every role', () => {
    const refs = eventRefs([line({ columnName: 'invitation', objectId: '7', objectType: 'user', verb: 'invite' })])

    expect(refs).toMatchObject({ hydrate: [], rows: [], subjects: [] })
  })

  // A file's name is a cuid and its only page is the media viewer, so the row worth showing is
  // the thing it was attached to, which is what the row already names as its parent.
  it('gives an upload the parent as its row and keeps the file as its subject', () => {
    const refs = eventRefs([
      line({
        objectId: 'f-1',
        objectType: 'file',
        parentId: '500',
        parentType: 'route',
        verb: 'add',
      }),
    ])

    expect(refs.subjects).toEqual([{ id: 'f-1', type: 'file' }])
    expect(refs.rows).toEqual([{ id: '500', type: 'route' }])
    // Both, because the card draws the photo off the file and names the route.
    expect(refs.hydrate).toEqual([
      { id: 'f-1', type: 'file' },
      { id: '500', type: 'route' },
    ])
  })

  // A removed member is out of the region, so a row offering their profile is a dead end. The
  // headline still names them, so the person is still fetched.
  it('fetches a removed member without giving them a row', () => {
    const refs = eventRefs([
      line({ columnName: 'role', newValue: 'Mara', objectId: '5', objectType: 'user', verb: 'remove' }),
    ])

    expect(refs).toMatchObject({
      hydrate: [{ id: '5', type: 'user' }],
      rows: [],
      subjects: [{ id: '5', type: 'user' }],
    })
  })

  it('names the place when every row agrees on one parent', () => {
    const underBlock = { parentId: '400', parentType: 'block' } as const

    expect(
      eventRefs([line({ objectId: '500', ...underBlock }), line({ objectId: '501', ...underBlock })]),
    ).toMatchObject({ place: { id: '400', type: 'block' } })
  })

  it('has no place when the rows span two parents, or when a row names none', () => {
    expect(
      eventRefs([
        line({ objectId: '500', parentId: '400', parentType: 'block' }),
        line({ objectId: '501', parentId: '401', parentType: 'block' }),
      ]).place,
    ).toBeUndefined()

    expect(
      eventRefs([line({ objectId: '500', parentId: '400', parentType: 'block' }), line({ objectId: '501' })]).place,
    ).toBeUndefined()
  })

  it('has nothing at all for no activities', () => {
    expect(eventRefs([])).toEqual({ hydrate: [], place: undefined, rows: [], subjects: [] })
  })
})
