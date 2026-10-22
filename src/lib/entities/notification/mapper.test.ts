import { expect, it } from 'vitest'
import { toNotification, type NotificationRow } from './mapper'

const row = (patch: Partial<NotificationRow>) =>
  ({ actor: undefined, actorFk: 7, id: 1, regionFk: 1, sourceType: 'comment', ...patch }) as NotificationRow

it('credits an actor who deleted their account as "Deleted user"', () => {
  expect(toNotification(row({ actorFk: null }), []).actorName).toBe('Deleted user')
})

it('stays empty while a live actor is still syncing', () => {
  expect(toNotification(row({}), []).actorName).toBe('')
})
