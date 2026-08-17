import { describe, expect, it } from 'vitest'
import { activity } from './catalogue.fixture'
import { metaLine } from './meta'

const NOW = new Date(2026, 2, 6, 12).getTime()
/** Inside `formatUploadedAt`'s relative window, so the sentence takes no preposition. */
const RECENT = new Date(2026, 2, 4, 17).getTime()
/** Past it, so the time renders as a date and the sentence needs "on" / "am". */
const OLD = new Date(2026, 0, 12, 9)

/** An entity whose log has been read and came back empty. */
const imported = { createdAt: OLD, creatorName: 'ada', latest: undefined, now: NOW }

describe('metaLine', () => {
  it('reads the newest row as an update', () => {
    expect(
      metaLine({
        ...imported,
        latest: activity({ columnName: 'gradeFk', createdAt: RECENT, type: 'updated', userName: 'mara' }),
      }),
    ).toEqual({ actor: 'mara', key: 'event_metaUpdated', timestamp: RECENT })
  })

  it('reads the entity s own creation row as a creation', () => {
    expect(
      metaLine({ ...imported, latest: activity({ createdAt: RECENT, type: 'created', userName: 'mara' }) }),
    ).toEqual({ actor: 'mara', key: 'event_metaCreated', timestamp: RECENT })
  })

  // The two halves of a photo. An upload points at the file and names the entity as its parent;
  // a removal is logged on the entity itself. Both are changes to it, neither is its creation.
  it('reads an upload as an update', () => {
    expect(
      metaLine({
        ...imported,
        latest: activity({
          createdAt: RECENT,
          entityType: 'file',
          parentEntityType: 'route',
          type: 'uploaded',
          userName: 'mara',
        }),
      })?.key,
    ).toBe('event_metaUpdated')
  })

  it('reads a photo removal as an update', () => {
    expect(
      metaLine({
        ...imported,
        latest: activity({ columnName: 'file', createdAt: RECENT, type: 'deleted', userName: 'mara' }),
      })?.key,
    ).toBe('event_metaUpdated')
  })

  // Past a week `formatUploadedAt` renders a date, and "Updated Jan 12, 2026 by mara" is missing
  // its preposition. German splits the same way ("vor 2 Tagen" against "am 12. Jan. 2026").
  it('takes the preposition once the time reads as a date', () => {
    expect(metaLine({ ...imported, latest: activity({ createdAt: OLD.getTime(), userName: 'mara' }) })?.key).toBe(
      'event_metaUpdatedOn',
    )
  })

  it('takes the preposition on a dated creation with no actor', () => {
    expect(metaLine({ ...imported, creatorName: undefined })?.key).toBe('event_metaCreatedOnUnknown')
  })

  it('falls back to the entity s own stamp when nothing is logged', () => {
    expect(metaLine(imported)).toEqual({
      actor: 'ada',
      key: 'event_metaCreatedOn',
      timestamp: OLD.getTime(),
    })
  })

  it('drops the actor from the sentence while the row s user has not synced', () => {
    expect(metaLine({ ...imported, latest: activity({ createdAt: RECENT, userName: '' }) })?.key).toBe(
      'event_metaUpdatedUnknown',
    )
  })

  it('says nothing at all when there is neither a row nor a stamp', () => {
    expect(metaLine({ ...imported, createdAt: undefined })).toBeUndefined()
  })
})
