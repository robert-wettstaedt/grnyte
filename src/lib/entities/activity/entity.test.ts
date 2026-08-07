import { describe, expect, it } from 'vitest'
import { activityRefs } from './entity'
import { activity } from './fixture'

/**
 * The four roles one pass answers. Each was its own collector, and each rule below is the reason
 * one of them existed: an invitation that must not hydrate its inviter, an upload that must name
 * what it landed on, a removed member who is fetched but not rendered, and the shared place a
 * burst headline names.
 */
describe('activityRefs', () => {
  it('lists each subject once, in the order the activities arrive', () => {
    expect(
      activityRefs([
        activity({ entityId: '2', id: 1 }),
        activity({ entityId: '3', id: 2 }),
        activity({ entityId: '2', id: 3 }),
        activity({ entityId: '2', entityType: 'block', id: 4 }),
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
    const refs = activityRefs([
      activity({ columnName: 'invitation', entityId: '7', entityType: 'user', type: 'created' }),
    ])

    expect(refs).toMatchObject({ hydrate: [], rows: [], subjects: [] })
  })

  // A file's name is a cuid and its only page is the media viewer, so the row worth showing is
  // the thing it was attached to, which is what the row already names as its parent.
  it('gives an upload the parent as its row and keeps the file as its subject', () => {
    const refs = activityRefs([
      activity({
        entityId: 'f-1',
        entityType: 'file',
        parentEntityId: '500',
        parentEntityType: 'route',
        type: 'uploaded',
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
    const refs = activityRefs([
      activity({ columnName: 'role', entityId: '5', entityType: 'user', newValue: 'Mara', type: 'deleted' }),
    ])

    expect(refs).toMatchObject({
      hydrate: [{ id: '5', type: 'user' }],
      rows: [],
      subjects: [{ id: '5', type: 'user' }],
    })
  })

  it('names the place when every row agrees on one parent', () => {
    const underBlock = { parentEntityId: '400', parentEntityType: 'block' } as const

    expect(
      activityRefs([activity({ entityId: '500', ...underBlock }), activity({ entityId: '501', ...underBlock })]),
    ).toMatchObject({ place: { id: '400', type: 'block' } })
  })

  it('has no place when the rows span two parents, or when a row names none', () => {
    expect(
      activityRefs([
        activity({ entityId: '500', parentEntityId: '400', parentEntityType: 'block' }),
        activity({ entityId: '501', parentEntityId: '401', parentEntityType: 'block' }),
      ]).place,
    ).toBeUndefined()

    expect(
      activityRefs([
        activity({ entityId: '500', parentEntityId: '400', parentEntityType: 'block' }),
        activity({ entityId: '501' }),
      ]).place,
    ).toBeUndefined()
  })

  it('has nothing at all for no activities', () => {
    expect(activityRefs([])).toEqual({ hydrate: [], place: undefined, rows: [], subjects: [] })
  })
})
