import { isTypingInField } from '$lib/components/SiblingNav/siblingNav'

export type MediaKeyAction =
  'faster' | 'seekBack' | 'seekForward' | 'slower' | 'stepBack' | 'stepForward' | 'toggleMute' | 'togglePlay'

const isSeekBar = (target: EventTarget | null) => target instanceof HTMLInputElement && target.type === 'range'

/** Whether the viewer's shortcuts should leave a key press alone. A focused seek bar is not typing. */
export function isMediaKeyExempt(event: KeyboardEvent) {
  return event.metaKey || event.ctrlKey || event.altKey || (isTypingInField(event) && !isSeekBar(event.target))
}

/** The playback shortcut a key press means, or null when it should be left alone. */
export function mediaKeyAction(
  event: KeyboardEvent,
  state: { canStep: boolean; sheetOpen: boolean },
): MediaKeyAction | null {
  if (state.sheetOpen || isMediaKeyExempt(event)) return null

  const target = event.target
  const onSeekBar = isSeekBar(target)

  const key = event.key.toLowerCase()
  // Held down, a toggle would flip at key-repeat rate and land anywhere.
  if (event.repeat && (key === ' ' || key === 'k' || key === 'm')) return null

  switch (key) {
    case ' ':
      return target instanceof Element && target.closest('button, a') != null ? null : 'togglePlay'
    case ',':
      return state.canStep ? 'stepBack' : null
    case '.':
      return state.canStep ? 'stepForward' : null
    case '<':
      return 'slower'
    case '>':
      return 'faster'
    case 'arrowleft':
      return onSeekBar ? null : 'seekBack'
    case 'arrowright':
      return onSeekBar ? null : 'seekForward'
    case 'k':
      return 'togglePlay'
    case 'm':
      return 'toggleMute'
    default:
      return null
  }
}
