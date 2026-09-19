import { describe, expect, it } from 'vitest'
import { isHdrVideo, readVideoColour } from './hdr'

const ascii = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text)

const concat = (parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

const u32 = (value: number): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value)
  return out
}

const box = (type: string, ...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const payload = concat(parts)
  return concat([u32(8 + payload.length), ascii(type), payload])
}

/** A box using the 64-bit `largesize` form: size 1, then an 8-byte length. */
const box64 = (type: string, ...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const payload = concat(parts)
  return concat([u32(1), ascii(type), u32(0), u32(16 + payload.length), payload])
}

/** A box declaring size 0, meaning "extends to the end of the parent". */
const boxToEnd = (type: string, ...parts: Uint8Array[]): Uint8Array<ArrayBuffer> =>
  concat([u32(0), ascii(type), concat(parts)])

/** An `nclx` colr payload: colour type, the CICP triple, then the full-range flag. */
const colr = (primaries: number, transfer: number, matrix: number): Uint8Array<ArrayBuffer> => {
  const triple = new Uint8Array(6)
  const view = new DataView(triple.buffer)
  view.setUint16(0, primaries)
  view.setUint16(2, transfer)
  view.setUint16(4, matrix)
  return box('colr', ascii('nclx'), triple, new Uint8Array(1))
}

/** `hdlr` carries its handler type 8 bytes in, after version/flags and `pre_defined`. */
const hdlr = (handler: string): Uint8Array<ArrayBuffer> =>
  box('hdlr', new Uint8Array(8), ascii(handler), new Uint8Array(13))

/** A visual sample entry: 78 bytes of fixed fields, then child boxes. */
const sampleEntry = (type: string, ...children: Uint8Array[]): Uint8Array<ArrayBuffer> =>
  box(type, new Uint8Array(78), ...children)

const stsd = (entry: Uint8Array): Uint8Array<ArrayBuffer> => box('stsd', new Uint8Array(4), u32(1), entry)

const trak = (handler: string, entry: Uint8Array): Uint8Array<ArrayBuffer> =>
  box('trak', box('mdia', hdlr(handler), box('minf', box('stbl', stsd(entry)))))

const videoTrak = (...children: Uint8Array[]) => trak('vide', sampleEntry('avc1', ...children))
const soundTrak = (...children: Uint8Array[]) => trak('soun', sampleEntry('mp4a', ...children))

const ftyp = box('ftyp', ascii('isomiso2mp41'))

const mp4 = (parts: Uint8Array[]): File => new File([concat(parts)], 'clip.mp4', { type: 'video/mp4' })

/** What a Pixel 9 records: BT.2020 primaries, HLG transfer, BT.2020 non-constant luminance. */
const HLG = { matrix: 9, primaries: 9, transfer: 18 }
const hlgFile = () => mp4([ftyp, box('moov', videoTrak(colr(9, 18, 9)))])

describe('readVideoColour', () => {
  it('reads the CICP triple from a nested video track', async () => {
    await expect(readVideoColour(hlgFile())).resolves.toEqual(HLG)
  })

  it('returns null when the video track declares no colour', async () => {
    await expect(readVideoColour(mp4([ftyp, box('moov', videoTrak())]))).resolves.toBeNull()
  })

  it('returns null when there is no moov box', async () => {
    await expect(readVideoColour(mp4([ftyp, box('mdat', new Uint8Array(64))]))).resolves.toBeNull()
  })

  it('walks past a large mdat to a trailing moov', async () => {
    const file = mp4([ftyp, box('mdat', new Uint8Array(200_000)), box('moov', videoTrak(colr(9, 18, 9)))])
    await expect(readVideoColour(file)).resolves.toEqual(HLG)
  })

  it('walks past a 64-bit mdat', async () => {
    const file = mp4([ftyp, box64('mdat', new Uint8Array(1024)), box('moov', videoTrak(colr(9, 18, 9)))])
    await expect(readVideoColour(file)).resolves.toEqual(HLG)
  })

  it('walks past a QuickTime wide atom', async () => {
    const file = mp4([ftyp, box('wide'), box('mdat', new Uint8Array(512)), box('moov', videoTrak(colr(9, 18, 9)))])
    await expect(readVideoColour(file)).resolves.toEqual(HLG)
  })

  it('walks past a long run of padding rather than giving up on a box count', async () => {
    const padding = Array.from({ length: 70 }, () => box('free', new Uint8Array(8)))
    await expect(readVideoColour(mp4([ftyp, ...padding, box('moov', videoTrak(colr(9, 18, 9)))]))).resolves.toEqual(HLG)
  })

  it('treats a size-0 box as running to the end, so nothing after it is found', async () => {
    const file = mp4([ftyp, boxToEnd('free'), box('moov', videoTrak(colr(9, 18, 9)))])
    await expect(readVideoColour(file)).resolves.toBeNull()
  })

  it('reads the video track, not a sound track that happens to carry colour', async () => {
    const file = mp4([ftyp, box('moov', soundTrak(colr(9, 18, 9)), videoTrak(colr(1, 1, 1)))])
    await expect(readVideoColour(file)).resolves.toEqual({ matrix: 1, primaries: 1, transfer: 1 })
  })

  it('finds a video track that follows a non-video one', async () => {
    await expect(readVideoColour(mp4([ftyp, box('moov', soundTrak(), videoTrak(colr(9, 18, 9)))]))).resolves.toEqual(
      HLG,
    )
  })
})

describe('isHdrVideo', () => {
  it('flags HLG', async () => {
    await expect(isHdrVideo(hlgFile())).resolves.toBe(true)
  })

  it('flags PQ', async () => {
    await expect(isHdrVideo(mp4([ftyp, box('moov', videoTrak(colr(9, 16, 9)))]))).resolves.toBe(true)
  })

  it('leaves BT.709 alone', async () => {
    await expect(isHdrVideo(mp4([ftyp, box('moov', videoTrak(colr(1, 1, 1)))]))).resolves.toBe(false)
  })

  it('leaves BT.2020 SDR alone, since only the transfer decides', async () => {
    await expect(isHdrVideo(mp4([ftyp, box('moov', videoTrak(colr(9, 14, 9)))]))).resolves.toBe(false)
  })

  it('does not warn when only a sound track is HDR-tagged', async () => {
    await expect(
      isHdrVideo(mp4([ftyp, box('moov', soundTrak(colr(9, 18, 9)), videoTrak(colr(1, 1, 1)))])),
    ).resolves.toBe(false)
  })

  it('does not warn about a file it cannot parse', async () => {
    await expect(isHdrVideo(new File([new Uint8Array(32)], 'clip.webm'))).resolves.toBe(false)
  })
})
