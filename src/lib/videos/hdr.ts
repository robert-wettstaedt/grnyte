/**
 * HDR detection for a picked video, read from the MP4/QuickTime `colr` box.
 *
 * Bunny's standard encoding copies a source's HDR colour tags onto its 8-bit SDR
 * H.264 output instead of tone mapping, so an HDR clip plays back washed out in
 * Firefox and clipped to white in iOS Safari. Until that is fixed upstream, the
 * picker warns the uploader instead of silently taking a broken video.
 *
 * The walk descends `moov > trak > mdia > minf > stbl > stsd` and reads only box
 * headers, so a 2GB pick costs a few kilobytes rather than a buffer of its `moov`.
 */

/** Transfer characteristics that mean HDR: PQ (ST 2084) and HLG (ARIB STD-B67). */
const HDR_TRANSFERS = new Set([16, 18])

/** `colr` payloads that carry the CICP triple; ICC profile variants say nothing about HDR. */
const CICP_COLOUR_TYPES = new Set(['nclc', 'nclx'])

/** Bounds the walk on a corrupt or hostile file. Padding runs of `free` stay well inside it. */
const MAX_BOX_READS = 1024

/** Fixed fields of a visual sample entry before its child boxes (`colr` among them). */
const VISUAL_SAMPLE_ENTRY_FIELDS = 78

export interface VideoColour {
  matrix: number
  primaries: number
  transfer: number
}

interface Box {
  /** First byte past the box. */
  readonly end: number
  /** First byte of the box's contents. */
  readonly payload: number
  readonly type: string
}

const fourCC = (view: DataView, offset: number): string =>
  String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  )

const readAt = async (file: File, start: number, length: number): Promise<DataView | null> => {
  if (start < 0 || start >= file.size) {
    return null
  }
  const buffer = await file.slice(start, Math.min(start + length, file.size)).arrayBuffer()
  return buffer.byteLength === 0 ? null : new DataView(buffer)
}

/** Shared across one parse so a file full of tiny boxes cannot fan out into unbounded reads. */
interface Budget {
  reads: number
}

const readBox = async (file: File, offset: number, limit: number, budget: Budget): Promise<Box | null> => {
  if (offset + 8 > limit || budget.reads++ >= MAX_BOX_READS) {
    return null
  }
  const header = await readAt(file, offset, 16)
  if (header == null || header.byteLength < 8) {
    return null
  }
  let size = header.getUint32(0)
  let headerSize = 8
  if (size === 1) {
    // 64-bit size; the high word only matters for files far past our upload cap.
    if (header.byteLength < 16) {
      return null
    }
    size = header.getUint32(8) * 2 ** 32 + header.getUint32(12)
    headerSize = 16
  } else if (size === 0) {
    // Extends to the end of its parent.
    size = limit - offset
  }
  if (size < headerSize || offset + size > limit) {
    return null
  }
  return { end: offset + size, payload: offset + headerSize, type: fourCC(header, 4) }
}

const findChild = async (file: File, start: number, end: number, type: string, budget: Budget): Promise<Box | null> => {
  let offset = start
  while (offset < end) {
    const box = await readBox(file, offset, end, budget)
    if (box == null) {
      return null
    }
    if (box.type === type) {
      return box
    }
    offset = box.end
  }
  return null
}

const childrenOf = async (file: File, start: number, end: number, type: string, budget: Budget): Promise<Box[]> => {
  const found: Box[] = []
  let offset = start
  while (offset < end) {
    const box = await readBox(file, offset, end, budget)
    if (box == null) {
      break
    }
    if (box.type === type) {
      found.push(box)
    }
    offset = box.end
  }
  return found
}

/** Follow a chain of single children, e.g. `mdia` then `minf` then `stbl`. */
const descend = async (file: File, box: Box, path: string[], budget: Budget): Promise<Box | null> => {
  let current: Box | null = box
  for (const type of path) {
    if (current == null) {
      return null
    }
    current = await findChild(file, current.payload, current.end, type, budget)
  }
  return current
}

/** A track's handler type sits 8 bytes into `hdlr`, after its version/flags and `pre_defined`. */
const isVideoTrack = async (file: File, trak: Box, budget: Budget): Promise<boolean> => {
  const hdlr = await descend(file, trak, ['mdia', 'hdlr'], budget)
  if (hdlr == null) {
    return false
  }
  const view = await readAt(file, hdlr.payload + 8, 4)
  return view != null && view.byteLength >= 4 && fourCC(view, 0) === 'vide'
}

const colourOfTrack = async (file: File, trak: Box, budget: Budget): Promise<null | VideoColour> => {
  const stsd = await descend(file, trak, ['mdia', 'minf', 'stbl', 'stsd'], budget)
  if (stsd == null) {
    return null
  }
  // `stsd` opens with its own version/flags and entry count before the first sample entry.
  const entry = await readBox(file, stsd.payload + 8, stsd.end, budget)
  if (entry == null) {
    return null
  }
  const colr = await findChild(file, entry.payload + VISUAL_SAMPLE_ENTRY_FIELDS, entry.end, 'colr', budget)
  if (colr == null) {
    return null
  }
  const view = await readAt(file, colr.payload, 10)
  if (view == null || view.byteLength < 10 || !CICP_COLOUR_TYPES.has(fourCC(view, 0))) {
    return null
  }
  return { matrix: view.getUint16(8), primaries: view.getUint16(4), transfer: view.getUint16(6) }
}

/**
 * The colour of the file's first video track, or `null` when it declares none. Picking the
 * video track matters: an export can carry a still or preview track whose colour differs.
 */
export const readVideoColour = async (file: File): Promise<null | VideoColour> => {
  try {
    const budget: Budget = { reads: 0 }
    const moov = await findChild(file, 0, file.size, 'moov', budget)
    if (moov == null) {
      return null
    }
    for (const trak of await childrenOf(file, moov.payload, moov.end, 'trak', budget)) {
      if (await isVideoTrack(file, trak, budget)) {
        const colour = await colourOfTrack(file, trak, budget)
        if (colour != null) {
          return colour
        }
      }
    }
    return null
  } catch {
    // A picked file can vanish or fail to read; an unreadable header is simply not a warning.
    return null
  }
}

/** Whether `file` is confidently HDR. Anything we cannot read reads as `false`, never a warning. */
export const isHdrVideo = async (file: File): Promise<boolean> => {
  const colour = await readVideoColour(file)
  return colour != null && HDR_TRANSFERS.has(colour.transfer)
}
