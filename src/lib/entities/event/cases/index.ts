/**
 * Every action the app can perform that the feed has an opinion about, as the events it writes.
 *
 * This is the review surface for the feed: driving the app cannot reach most of these states (a
 * revoked invitation, a deleted area's counts, a five-photo submit, somebody else's session), so
 * the wall renders them through the real `groupEvents` and `eventCard` instead. What is on screen
 * is what the app renders; a case that folds into two cards shows two.
 *
 * `cases.test.ts` reads every `insertEvent` and `createUpdateEvent` call in the app and fails when
 * a `(verb, object)` pair or a diffed column has no case here, so this cannot quietly fall behind
 * the write path.
 *
 * Storybook and tests only. Nothing in the app imports it.
 */
import { AREA_CASES } from './area'
import { ASCENT_CASES } from './ascent'
import { BLOCK_CASES } from './block'
import { FILE_CASES } from './file'
import { GROUPING_CASES } from './grouping'
import { REGION_CASES } from './region'
import { ROUTE_CASES } from './route'
import { SOCIAL_CASES } from './social'
import { TOPO_CASES } from './topo'
import type { EventCase } from './types'

export const EVENT_CASES: EventCase[] = [
  ...AREA_CASES,
  ...BLOCK_CASES,
  ...ROUTE_CASES,
  ...ASCENT_CASES,
  ...FILE_CASES,
  ...TOPO_CASES,
  ...REGION_CASES,
  ...GROUPING_CASES,
  ...SOCIAL_CASES,
]
