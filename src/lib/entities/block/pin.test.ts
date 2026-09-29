/** `usablePhotoCoordinates` is the gate between a photo's EXIF and a block's pin. Android returns
 *  the GPS tags zero-filled rather than absent, which an `== null` guard waves through. */
import { describe, expect, it, vi } from 'vitest'
import { locateFromPhotos, usablePhotoCoordinates } from './pin'

describe('usablePhotoCoordinates', () => {
  it('accepts a real pair', () => {
    expect(usablePhotoCoordinates({ latitude: 47.5, longitude: 11.5 })).toBe(true)
  })

  it('rejects the NaN pair Android hands back for a redacted photo', () => {
    expect(usablePhotoCoordinates({ latitude: NaN, longitude: NaN })).toBe(false)
  })

  it('rejects a pair that is only half NaN', () => {
    expect(usablePhotoCoordinates({ latitude: 47.5, longitude: NaN })).toBe(false)
  })

  it('rejects an absent or half-absent pair', () => {
    expect(usablePhotoCoordinates(undefined)).toBe(false)
    expect(usablePhotoCoordinates({})).toBe(false)
    expect(usablePhotoCoordinates({ latitude: 47.5 })).toBe(false)
  })

  it('rejects Infinity', () => {
    expect(usablePhotoCoordinates({ latitude: Infinity, longitude: 11.5 })).toBe(false)
  })

  it('rejects 0,0, which is a clean zero-fill rather than a location', () => {
    expect(usablePhotoCoordinates({ latitude: 0, longitude: 0 })).toBe(false)
  })

  it('still accepts a genuine zero on one axis', () => {
    expect(usablePhotoCoordinates({ latitude: 0, longitude: 11.5 })).toBe(true)
    expect(usablePhotoCoordinates({ latitude: 47.5, longitude: 0 })).toBe(true)
  })
})

describe('locateFromPhotos', () => {
  const types: Record<string, string> = { png: 'image/png', webp: 'image/webp' }
  const photo = (name: string) => new File([], name, { type: types[name.split('.')[1]] ?? 'image/jpeg' })
  const at = { gps: { latitude: 47.5, longitude: 11.5 } }
  const bare = { gps: undefined }

  function scan(reads: Record<string, unknown>, save = vi.fn(async () => {})) {
    const report = vi.fn()
    const read = vi.fn(async (file: File) => {
      const result = reads[file.name]
      if (result instanceof Error) throw result
      return result as Awaited<ReturnType<Parameters<typeof locateFromPhotos>[1]['read']>>
    })
    return { read, report, run: (names: string[]) => locateFromPhotos(names.map(photo), { read, report, save }), save }
  }

  it('saves the first usable location and stops scanning', async () => {
    const { read, run, save } = scan({ a: at, b: at })

    expect(await run(['a', 'b'])).toBe('saved')
    expect(save).toHaveBeenCalledWith({ lat: 47.5, long: 11.5 })
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('says none only when every photo read cleanly and carried no location', async () => {
    const { run, save } = scan({ a: bare, b: bare })

    expect(await run(['a', 'b'])).toBe('none')
    expect(save).not.toHaveBeenCalled()
  })

  it('says none for a photo with no EXIF at all, which exifr returns as undefined', async () => {
    // A stripped JPEG. It must not read as a failure.
    const { run } = scan({ a: undefined })

    expect(await run(['a'])).toBe('none')
  })

  it('says none for a PNG or WebP, which exifr lite cannot read at all', async () => {
    // A screenshot: lite throws "Unknown file format", which is not our failure.
    const unknown = new Error('Unknown file format')
    const { read, report, run } = scan({ 'a.png': unknown, 'b.webp': unknown })

    expect(await run(['a.png', 'b.webp'])).toBe('none')
    expect(read).not.toHaveBeenCalled()
    expect(report).not.toHaveBeenCalled()
  })

  it('skips a PNG by its name when the browser sent no type', async () => {
    const report = vi.fn()
    const read = vi.fn(async () => {
      throw new Error('Unknown file format')
    })

    expect(await locateFromPhotos([new File([], 'a.png')], { read, report, save: vi.fn() })).toBe('none')
    expect(read).not.toHaveBeenCalled()
    expect(report).not.toHaveBeenCalled()
  })

  it('still saves a JPEG location from a batch that also holds a screenshot', async () => {
    const { run, save } = scan({ 'a.png': new Error('Unknown file format'), b: at })

    expect(await run(['a.png', 'b'])).toBe('saved')
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('says failed, not none, when a read throws', async () => {
    const { report, run } = scan({ a: new Error('corrupt') })

    expect(await run(['a'])).toBe('failed')
    expect(report).toHaveBeenCalledTimes(1)
  })

  it('says failed when a read reports range errors, which look exactly like no location', async () => {
    const range = new Error('range')
    const { report, run } = scan({ a: { errors: [range], gps: undefined } })

    expect(await run(['a'])).toBe('failed')
    expect(report).toHaveBeenCalledWith(range)
  })

  it('says failed when the photo had a location but saving it did not work', async () => {
    const refused = new Error('500')
    const { report, run } = scan(
      { a: at },
      vi.fn(async () => {
        throw refused
      }),
    )

    expect(await run(['a'])).toBe('failed')
    expect(report).toHaveBeenCalledWith(refused)
  })

  it('keeps scanning past a failure and still saves a later photo', async () => {
    const { run, save } = scan({ a: new Error('corrupt'), b: at })

    expect(await run(['a', 'b'])).toBe('saved')
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('reports failed when one photo failed and the rest simply had no location', async () => {
    // It cannot honestly say "no location": the failed photo might have had one.
    const { run } = scan({ a: new Error('corrupt'), b: bare })

    expect(await run(['a', 'b'])).toBe('failed')
  })

  it('does not save an unusable location, such as the zero-filled pair Android returns', async () => {
    const { run, save } = scan({ a: { gps: { latitude: 0, longitude: 0 } } })

    expect(await run(['a'])).toBe('none')
    expect(save).not.toHaveBeenCalled()
  })
})
