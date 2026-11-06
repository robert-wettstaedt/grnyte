import type { MediaFile } from '$lib/entities/file/dto'
import { fireEvent, render } from '@testing-library/svelte'
import { flushSync } from 'svelte'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMediaChrome } from './chrome.svelte'
import MediaStage from './MediaStage.svelte'

vi.mock('$lib/state/global.svelte', () => ({
  getGlobalState: () => ({ grades: [], gradingScale: 'FB', user: undefined }),
}))
// jsdom has no matchMedia.
vi.mock('$lib/state/motion.svelte', () => ({ motion: () => 0, prefersStill: () => true }))
vi.mock('$lib/components/Modal/Modal.svelte', () => ({ default: () => {} }))
// jsdom has no ResizeObserver, and these gestures are driven in the real app.
let onZoom: (scale: number) => void = () => {}
vi.mock('$lib/components/Topo/panzoom', () => ({
  panzoom: (_node: HTMLElement, params: { onZoom: (scale: number) => void }) => {
    onZoom = params.onZoom
    return {}
  },
}))
vi.mock('$lib/videos/hls', () => ({ createHlsAttachment: () => () => {} }))
vi.mock('$lib/videos/view.svelte', () => ({
  videoView: (file: MediaFile) =>
    file.bunnyStreamFk == null
      ? undefined
      : { hls: 'https://cdn/x.m3u8', iframe: 'https://cdn/embed', kind: 'playable', poster: 'https://cdn/p.jpg' },
  watchReadiness: () => {},
}))

const fixture = (bunnyStreamFk: string | undefined): MediaFile =>
  ({ bunnyStreamFk, createdAt: 0, id: 'file-1', path: 'a.jpg', source: undefined }) as unknown as MediaFile

const play = vi.fn(() => Promise.resolve())
const pause = vi.fn()

beforeEach(() => {
  window.matchMedia = vi.fn(() => ({
    addEventListener: () => {},
    matches: true,
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
  play.mockClear()
  pause.mockClear()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const mountVideo = () => {
  const chrome = createMediaChrome()
  const view = render(MediaStage, { chrome, file: fixture('guid') })
  flushSync()
  const video = view.container.querySelector('video')!
  return { ...view, chrome, stage: video.parentElement!, video }
}

const setMedia = (video: HTMLVideoElement, state: Partial<Record<'ended' | 'paused', boolean>>) => {
  for (const [key, value] of Object.entries(state)) {
    Object.defineProperty(video, key, { configurable: true, value })
  }
}

const startPlaying = (video: HTMLVideoElement) => {
  setMedia(video, { paused: false })
  video.dispatchEvent(new Event('play'))
  flushSync()
}

const press = (stage: HTMLElement, pointerType: string) => {
  stage.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType }))
  stage.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  flushSync()
}

it('a tap on a playing video toggles the controls and does not pause', () => {
  vi.useFakeTimers()
  const { chrome, stage, video } = mountVideo()
  startPlaying(video)

  press(stage, 'touch')
  vi.advanceTimersByTime(250)

  expect(pause).not.toHaveBeenCalled()
  expect(chrome.visible).toBe(false)
  vi.useRealTimers()
})

it('a double-tap zoom keeps the controls up', () => {
  vi.useFakeTimers()
  const { chrome, stage, video } = mountVideo()
  startPlaying(video)

  press(stage, 'touch')
  onZoom(2)
  vi.advanceTimersByTime(250)

  expect(chrome.visible).toBe(true)
  vi.useRealTimers()
})

it('a mouse click on a playing video pauses and shows the controls', () => {
  vi.useFakeTimers()
  const { chrome, stage, video } = mountVideo()
  startPlaying(video)
  chrome.tap()
  vi.advanceTimersByTime(250)

  press(stage, 'mouse')

  expect(pause).toHaveBeenCalledOnce()
  expect(chrome.visible).toBe(true)
  vi.useRealTimers()
})

it('a mouse click on a photo toggles its controls', () => {
  vi.useFakeTimers()
  const chrome = createMediaChrome()
  const { container } = render(MediaStage, { chrome, file: fixture(undefined) })
  flushSync()

  press(container.querySelector('img')!.closest('.overflow-hidden')!, 'mouse')
  vi.advanceTimersByTime(250)

  expect(chrome.visible).toBe(false)
  vi.useRealTimers()
})

it('moving the mouse reveals a hidden video, but not a hidden photo', () => {
  vi.useFakeTimers()
  const move = () => new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' })
  const moved = () => Object.defineProperty(move(), 'movementX', { value: 4 })

  const video = mountVideo()
  video.chrome.tap()
  vi.advanceTimersByTime(250)
  video.stage.dispatchEvent(move())
  expect(video.chrome.visible).toBe(false)
  video.stage.dispatchEvent(moved())
  expect(video.chrome.visible).toBe(true)
  video.unmount()

  const chrome = createMediaChrome()
  const { container } = render(MediaStage, { chrome, file: fixture(undefined) })
  flushSync()
  chrome.tap()
  vi.advanceTimersByTime(250)
  container.querySelector('img')!.closest('.overflow-hidden')!.dispatchEvent(moved())
  expect(chrome.visible).toBe(false)
  vi.useRealTimers()
})

it('offers Repeat only once the video has ended', async () => {
  const { queryByRole, video } = mountVideo()
  expect(queryByRole('button', { name: 'Repeat' })).toBeNull()

  setMedia(video, { ended: true, paused: true })
  video.dispatchEvent(new Event('ended'))
  flushSync()
  const repeat = queryByRole('button', { name: 'Repeat' })
  expect(repeat).not.toBeNull()

  await fireEvent.click(repeat!)
  expect(play).toHaveBeenCalledOnce()

  setMedia(video, { ended: false })
  video.dispatchEvent(new Event('timeupdate'))
  flushSync()
  await vi.waitFor(() => expect(queryByRole('button', { name: 'Repeat' })).toBeNull())
})

it('brings hidden controls back when the video ends', () => {
  vi.useFakeTimers()
  const { chrome, video } = mountVideo()
  chrome.tap()
  vi.advanceTimersByTime(250)

  setMedia(video, { ended: true, paused: true })
  video.dispatchEvent(new Event('ended'))
  flushSync()

  expect(chrome.visible).toBe(true)
  vi.useRealTimers()
})

it('does not offer stepping before there is anything to step through', () => {
  const { queryByRole, video } = mountVideo()
  expect(queryByRole('button', { name: 'Step forward' })).toBeNull()

  setReady(video, 1, 'loadedmetadata')
  expect(queryByRole('button', { name: 'Step forward' })).not.toBeNull()
})

it('offers stepping only while paused', async () => {
  const { queryByRole, video } = mountVideo()
  setReady(video, 1, 'loadedmetadata')
  video.dispatchEvent(new Event('pause'))
  flushSync()
  expect(queryByRole('button', { name: 'Step back' })).not.toBeNull()
  expect(queryByRole('button', { name: 'Step forward' })).not.toBeNull()

  startPlaying(video)

  await vi.waitFor(() => expect(queryByRole('button', { name: 'Step forward' })).toBeNull())
})

it('steps the video position while paused', async () => {
  const { getByRole, video } = mountVideo()
  setReady(video, 1, 'loadedmetadata')
  video.currentTime = 2

  await fireEvent.click(getByRole('button', { name: 'Step forward' }))

  expect(video.currentTime).toBeCloseTo(2 + 1 / 30)
})

it('starts muted, carries an unmute to the next video, and keeps it after a refused autoplay', async () => {
  const first = mountVideo()
  expect(first.video.muted).toBe(true)

  await fireEvent.click(first.getByRole('button', { name: 'Unmute' }))
  first.unmount()

  const second = mountVideo()
  expect(second.video.muted).toBe(false)

  second.video.muted = true
  second.video.dispatchEvent(new Event('volumechange'))
  flushSync()
  second.unmount()

  const third = mountVideo()
  expect(third.video.muted).toBe(false)

  // Module state outlives this test.
  await fireEvent.click(third.getByRole('button', { name: 'Mute' }))
  third.unmount()
})

it('changes speed from the keyboard, stopping at the limit, and resets on the next video', () => {
  const first = mountVideo()
  const key = (value: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: value }))

  key('>')
  flushSync()
  expect(first.video.playbackRate).toBe(1.5)
  key('>')
  key('>')
  flushSync()
  expect(first.video.playbackRate).toBe(2)
  first.unmount()

  const second = mountVideo()
  expect(second.video.playbackRate).toBe(1)
  second.unmount()
})

it('a shortcut reveals hidden controls', () => {
  vi.useFakeTimers()
  const { chrome } = mountVideo()
  chrome.tap()
  vi.advanceTimersByTime(250)

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }))

  expect(chrome.visible).toBe(true)
  vi.useRealTimers()
})

function setReady(video: HTMLVideoElement, readyState: number, event: string) {
  Object.defineProperty(video, 'readyState', { configurable: true, value: readyState })
  video.dispatchEvent(new Event(event))
  flushSync()
}

it('shows a spinner during a stall without revealing hidden controls, and clears it on resume', () => {
  vi.useFakeTimers()
  const { chrome, container, video } = mountVideo()
  const spinner = () => container.querySelector('[role="status"]')
  startPlaying(video)
  setReady(video, 4, 'playing')
  expect(spinner()).toBeNull()
  vi.advanceTimersByTime(3000)
  expect(chrome.visible).toBe(false)

  setReady(video, 2, 'waiting')
  expect(spinner()).not.toBeNull()
  expect(chrome.visible).toBe(false)

  setReady(video, 4, 'playing')
  expect(spinner()).toBeNull()
  vi.useRealTimers()
})

it('does not count a stall as playing, so the wait restarts on resume', () => {
  vi.useFakeTimers()
  const { chrome, video } = mountVideo()
  startPlaying(video)
  setReady(video, 4, 'playing')
  vi.advanceTimersByTime(2000)

  setReady(video, 2, 'waiting')
  vi.advanceTimersByTime(60_000)
  expect(chrome.visible).toBe(true)

  setReady(video, 4, 'playing')
  vi.advanceTimersByTime(2999)
  expect(chrome.visible).toBe(true)
  vi.advanceTimersByTime(1)
  expect(chrome.visible).toBe(false)
  vi.useRealTimers()
})

it('does not read the end of a video as buffering', () => {
  const { container, video } = mountVideo()

  setMedia(video, { ended: true, paused: true })
  video.dispatchEvent(new Event('ended'))
  setReady(video, 2, 'waiting')

  expect(container.querySelector('[role="status"]')).toBeNull()
})

// The bar's step stops short of a length like 60.01, and Android paints a stale frame at the exact end.
const dragNearEnd = (video: HTMLVideoElement, position: number) => {
  Object.defineProperty(video, 'duration', { configurable: true, value: 60.01 })
  video.dispatchEvent(new Event('durationchange'))
  video.currentTime = position
  video.dispatchEvent(new Event('timeupdate'))
  flushSync()
}

it('offers Repeat for a paused video dragged to the end of the bar, and restarts it from the start', async () => {
  const { getByRole, video } = mountVideo()
  dragNearEnd(video, 60)

  await fireEvent.click(getByRole('button', { name: 'Repeat' }))

  expect(video.currentTime).toBe(0)
  expect(play).toHaveBeenCalledOnce()
})

it('keeps playing from the start when Repeat is pressed twice', async () => {
  const { getByRole, video } = mountVideo()
  dragNearEnd(video, 60)
  const repeat = getByRole('button', { name: 'Repeat' })

  await fireEvent.click(repeat)
  setMedia(video, { paused: false })
  await fireEvent.click(repeat)

  expect(pause).not.toHaveBeenCalled()
  expect(play).toHaveBeenCalledTimes(2)
})

it('shows no spinner behind Repeat at the end of the bar', () => {
  const { container, video } = mountVideo()

  dragNearEnd(video, 60)
  setReady(video, 2, 'waiting')

  expect(container.querySelector('[role="status"]')).toBeNull()
})

// A popover closes about 12 ms after the press, well before the click, so this order is the real one.
const pressDismissingSheet = (
  chrome: ReturnType<typeof createMediaChrome>,
  stage: HTMLElement,
  pointerType: string,
) => {
  chrome.setHold('stageSheet', true)
  stage.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType }))
  chrome.setHold('stageSheet', false)
  stage.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  flushSync()
}

it('a mouse click that dismisses a sheet does not also pause', () => {
  const { chrome, stage, video } = mountVideo()
  startPlaying(video)

  pressDismissingSheet(chrome, stage, 'mouse')

  expect(pause).not.toHaveBeenCalled()
})

it('a tap that dismisses a sheet does not also hide the controls', () => {
  vi.useFakeTimers()
  const { chrome, stage, video } = mountVideo()
  startPlaying(video)

  pressDismissingSheet(chrome, stage, 'touch')
  vi.advanceTimersByTime(250)

  expect(chrome.visible).toBe(true)
  vi.useRealTimers()
})

it('takes the next press normally after a sheet was dismissed', () => {
  const { chrome, stage, video } = mountVideo()
  startPlaying(video)
  pressDismissingSheet(chrome, stage, 'mouse')

  press(stage, 'mouse')

  expect(pause).toHaveBeenCalledOnce()
})

it('lets go of the seek bar after a pointer drag, so shortcuts and paging keep working', () => {
  const { container } = mountVideo()
  const seek = container.querySelector<HTMLInputElement>('input[type="range"]')!
  seek.focus()
  expect(document.activeElement).toBe(seek)

  seek.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))

  expect(document.activeElement).not.toBe(seek)
})

it('does not offer Repeat short of the end, or while the video is still playing', () => {
  const { queryByRole, video } = mountVideo()

  dragNearEnd(video, 59)
  expect(queryByRole('button', { name: 'Repeat' })).toBeNull()

  startPlaying(video)
  dragNearEnd(video, 60)
  expect(queryByRole('button', { name: 'Repeat' })).toBeNull()
})

it.each([
  ['Play', 'Space k'],
  ['Step back', ','],
  ['Step forward', '.'],
  ['Unmute', 'm'],
])('%s exposes its shortcut to assistive technology', (name, shortcut) => {
  const { getByRole, video } = mountVideo()
  setReady(video, 1, 'loadedmetadata')

  expect(getByRole('button', { name }).getAttribute('aria-keyshortcuts')).toBe(shortcut)
})

it('ignores shortcuts while a sheet from the page is open', () => {
  const { chrome, video } = mountVideo()
  chrome.setHold('sheet', true)

  window.dispatchEvent(new KeyboardEvent('keydown', { key: '>' }))
  flushSync()

  expect(video.playbackRate).toBe(1)
})

it('shows the poster', () => {
  const { video } = mountVideo()

  expect(video.getAttribute('poster')).toBe('https://cdn/p.jpg')
})
