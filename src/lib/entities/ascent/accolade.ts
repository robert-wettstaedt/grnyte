import type { AscentType } from './dto'
import { deriveProjects, type ProjectAscent } from './projects'

/**
 * The one claim a send's card is allowed to make about it.
 *
 * At most one, ranked, chosen by the system and not customisable, which is Strava's shipped rule
 * and is stricter than it looks: a card that lists every achievement makes the rare one
 * illegible, so the rest belongs on the ascent's own screen.
 *
 * Both claims are facts the climber logged rather than judgements of what the climb meant to them.
 * That is deliberate: nothing here knows about the year somebody had, so nothing here says so.
 */
export type Accolade =
  | {
      /** Days from the first attempt of the run to the send. */
      days: number
      kind: 'project'
      /** Days the climber turned up for it, the send included. See `ProjectRoute.sessions`:
       *  one row per route per day, and rows that share a day fold into one session. */
      sessions: number
    }
  | { kind: 'ceiling' }

/**
 * The ascent fields a claim is derived from.
 *
 * `id` is in it so an ascent can exclude itself from its own history without the caller having to
 * remember to filter first, which is the kind of precondition that holds until somebody adds a
 * second call site.
 */
export interface AccoladeAscent extends ProjectAscent {
  gradeFk: number | undefined
  id: number
}

/**
 * Read a stored claim back, or nothing when the column holds something this version cannot use.
 *
 * Never throws. The column is written by one function and read by one card, but it is still a text
 * column in a database: an older shape, a hand-edited row or a half-written value must render as
 * "no claim" rather than take the feed down.
 */
export function parseAccolade(stored: null | string | undefined): Accolade | undefined {
  if (stored == null || stored.length === 0) {
    return undefined
  }

  try {
    const parsed: unknown = JSON.parse(stored)

    if (parsed == null || typeof parsed !== 'object') {
      return undefined
    }

    const claim = parsed as Partial<Accolade>

    if (claim.kind === 'ceiling') {
      return { kind: 'ceiling' }
    }

    if (claim.kind === 'project' && typeof claim.days === 'number' && typeof claim.sessions === 'number') {
      return { days: claim.days, kind: 'project', sessions: claim.sessions }
    }

    return undefined
  } catch {
    return undefined
  }
}

/**
 * How far back a ceiling claim looks.
 *
 * Twelve months, which is what 8a.nu defaults an athlete's ascent list to, so the audience is
 * already trained on the window. A lifetime maximum was the obvious alternative and is wrong: an
 * 8B from ten years ago would veto every banner for a climber whose life has changed since, and
 * form moves through a year anyway, so not every session is a limit session even in a good month.
 */
const CEILING_WINDOW_MS = 365 * 24 * 60 * 60 * 1000

/**
 * What a caller's history is able to answer.
 *
 * The two claims need different reads, and that difference is the one thing about this module a
 * caller kept getting wrong. A ceiling is measured against the climber's sends across every route,
 * so a rolling window answers it. A project counts the attempts on ONE route, so only that route's
 * whole run answers it: a window reaching back a year reports "no attempts" for a run that started
 * before it, and worse, reports whichever attempts DID fall inside as a complete run.
 *
 * Declaring coverage rather than passing a flat list is what makes that structural. A caller who
 * cannot cover the route omits `onRoute` and gets no project claim; it is not possible to ask for
 * one from a history that cannot support it. The rule used to live in a ternary at the call site
 * and in four comments, and the call site got it wrong.
 */
export interface AccoladeHistory {
  /**
   * Every ascent this climber has on the ascent's own route, or absent when the read could not
   * cover the whole run. Absent disables the project claim rather than guessing at it.
   */
  onRoute?: readonly AccoladeAscent[]
  /** The climber's ascents reaching back at least the ceiling window, across every route. */
  window: readonly AccoladeAscent[]
}

/**
 * The claim this ascent earns, if any.
 *
 * Ranked, and effort wins. "23 sessions over four months" is the harder thing to have done and the
 * one that survives the case grade cannot see: somebody returning after years away sends well
 * below what they once did, and the climb still cost them everything they had.
 *
 * The ceiling claim exists because effort is silent for most people. Logging attempts is
 * voluntary, so a project that was never logged as attempts leaves no trace to count, and grade is
 * what still fires for those climbers.
 */
export function deriveAccolade(ascent: AccoladeAscent, history: AccoladeHistory): Accolade | undefined {
  if (ascent.type === 'attempt') {
    return undefined
  }

  const earned = history.onRoute == null ? undefined : project(ascent, history.onRoute)

  return earned ?? ceiling(ascent, history.window)
}

/**
 * Whether this send is also the hardest of its own kind inside the window.
 *
 * Two pools, not four (see `ceilingPool`): a flash competes only with flashes, and a redpoint and
 * a repeat compete with each other. Strictly harder, and only against grades that are actually
 * recorded.
 *
 * At least one earlier send in the same pool has to exist, or the claim is vacuous: the first
 * flash somebody ever logs is trivially their hardest and says nothing.
 *
 * ponytail: one prior send is the whole floor, so an ascent can carry this on thin evidence. Left
 * low deliberately, because no reaction or grade data exists yet to say what a meaningful floor
 * is; raise it once a real season has been watched. Upgrade = a count threshold here.
 */
function ceiling(ascent: AccoladeAscent, history: readonly AccoladeAscent[]): Accolade | undefined {
  const grade = ascent.gradeFk
  const sent = ascent.dateTime

  if (grade == null || sent == null) {
    return undefined
  }

  const cutoff = sent - CEILING_WINDOW_MS
  const pool = ceilingPool(ascent.type)
  const earlier = history.filter(
    (other) =>
      other.id !== ascent.id &&
      // Attempts are excluded by hand rather than falling out of the type match. They used to,
      // back when the pool WAS the type; an attempt now shares a pool with the redpoint it was
      // an attempt at, and an ungraded failure is not evidence about anybody's ceiling.
      other.type !== 'attempt' &&
      ceilingPool(other.type) === pool &&
      other.dateTime != null &&
      other.dateTime >= cutoff &&
      other.dateTime <= sent,
  )

  // Only the ones that recorded a grade. Half this app's ascents are logged without one, and
  // treating "no opinion" as "not lower" let a single ungraded redpoint in March silently veto the
  // banner for the hardest send of the year in July. The floor is counted AFTER the filter for the
  // same reason: a history of nothing but ungraded rows is not evidence of a ceiling.
  const graded = earlier.filter((other) => other.gradeFk != null)

  if (graded.length === 0) {
    return undefined
  }

  // `graded` has already dropped the ungraded, so every `gradeFk` here is a number. Spelled with a
  // narrowing filter rather than a `?? 0`, which would read as "ungraded counts as easiest" and is
  // the exact bug the filter above exists to prevent.
  return graded.every((other) => Number(other.gradeFk) < grade) ? { kind: 'ceiling' } : undefined
}

/**
 * Which sends a ceiling claim competes against.
 *
 * A flash is its own pool: doing it first try is a different achievement, and a climber's ceiling
 * in it moves independently. A redpoint and a repeat share one, because both are climbs that were
 * worked, and giving a repeat a pool of its own was the bug: a climber who repeats one 7B a year
 * is trivially the hardest repeater they know, so "hardest of its kind" fired on a climb that
 * broke no new ground. Pooled, a repeat has to beat every redpoint of the year to say anything,
 * and a hard repeat now also blocks a weaker redpoint's claim, which it could not do before.
 *
 * `attempt` maps here too, so callers must exclude it before asking. It is not a send and has no
 * pool; the value is only there because the enum has four members.
 */
function ceilingPool(type: AscentType): 'flash' | 'worked' {
  return type === 'flash' ? 'flash' : 'worked'
}

/**
 * Whether this send ended a project, and what it cost.
 *
 * `deriveProjects` already owns what a project is (a first send preceded by more than one
 * attempt), and owns it for the profile screen too. Asking it rather than re-deriving here is what
 * stops a feed card and a logbook disagreeing about the same climb.
 *
 * Only the FIRST send counts. A repeat years later is its own climb, and calling it the end of a
 * project would re-award the same work every time somebody went back.
 */
function project(ascent: AccoladeAscent, history: readonly AccoladeAscent[]): Accolade | undefined {
  const onRoute = history.filter((other) => other.routeFk === ascent.routeFk && other.id !== ascent.id)

  // An earlier send ended the project, so this one ended nothing.
  //
  // The tie is broken on id rather than swallowed. `date_time` is a pg `date`, so a send and a
  // victory lap on the same afternoon carry the SAME value: comparing with `<=` made each of them
  // "already sent before today" from the other's point of view and killed the claim on both, which
  // is stricter than `deriveProjects` (which resolves the tie by order) and would erase a banner
  // the send had already earned the moment the lap was logged.
  if (
    onRoute.some(
      (other) =>
        other.type !== 'attempt' &&
        ((other.dateTime ?? 0) < (ascent.dateTime ?? 0) ||
          ((other.dateTime ?? 0) === (ascent.dateTime ?? 0) && other.id < ascent.id)),
    )
  ) {
    return undefined
  }

  const completed = deriveProjects([...onRoute, ascent]).completed.find((route) => route.routeFk === ascent.routeFk)

  if (completed == null) {
    return undefined
  }

  const started = onRoute.flatMap((other) =>
    other.type === 'attempt' && other.dateTime != null ? [other.dateTime] : [],
  )
  const sent = ascent.dateTime

  return {
    days: sent == null || started.length === 0 ? 0 : Math.round((sent - Math.min(...started)) / 86_400_000),
    kind: 'project',
    sessions: completed.sessions,
  }
}
