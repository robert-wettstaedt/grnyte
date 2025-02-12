import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
const baseURL = isSafari
  ? 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
  : 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm'

const createFFmpeg = async (file: File | Blob, onProgress?: (progress: number) => void) => {
  const ffmpeg = new FFmpeg()

  ffmpeg.on('progress', ({ progress }) => onProgress?.(progress))

  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
  })

  await ffmpeg.writeFile('input.mp4', await fetchFile(file))

  return ffmpeg
}

export const transcode = async (
  file: File | Blob,
  signal: AbortSignal | undefined | null,
  onProgress?: (progress: number) => void,
) => {
  const ffmpeg = await createFFmpeg(file, onProgress)

  const abort = () => {
    ffmpeg.terminate()
  }

  signal?.addEventListener('abort', abort)

  await ffmpeg.exec(['-i', 'input.mp4', '-c:a', settings.audioCodec, '-c:v', settings.videoCodec, 'output.mp4'])
  const output = await ffmpeg.readFile('output.mp4')

  onProgress?.(1)

  signal?.removeEventListener('abort', abort)

  if (!(output instanceof Uint8Array)) {
    throw new Error('Invalid type')
  }

  return output
}

export const compress = async (
  file: File | Blob,
  signal: AbortSignal | undefined | null,
  onProgress?: (progress: number) => void,
) => {
  const ffmpeg = await createFFmpeg(file, onProgress)

  const abort = () => {
    ffmpeg.terminate()
  }

  signal?.addEventListener('abort', abort)

  // prettier-ignore
  await ffmpeg.exec([
    '-i',
    'input.mp4',

    // ===== Video Settings =====
    '-c:v', 'libx264',        // Use H.264 codec - most compatible
    '-b:v', '2500k',          // Video bitrate
    '-preset', 'ultrafast',   // Fastest encoding speed, sacrifices compression efficiency
    '-crf', '35',             // Constant Rate Factor: 0-51, higher = more compression, lower quality
                              // 35 is quite aggressive compression but still acceptable for mobile

    // Speed Optimizations
    '-rc-lookahead', '10',    // Reduce lookahead buffer (default 40-50) for faster encoding
    '-refs', '1',             // Use only 1 reference frame (default 3) - speeds up encoding
    '-g', '30',               // Keyframe every 30 frames (1 second at 30fps)
    '-keyint_min', '30',      // Force minimum keyframe interval
    '-sc_threshold', '0',     // Disable scene change detection for speed

    // Resolution Control
    '-vf', "scale='max(720,720*dar)':'max(720,720/dar)':force_original_aspect_ratio=1",
                              // Scale to max 960x540 (qHD) - good balance of quality and size

    // Frame Rate
    '-r', '30',               // Target 30fps - good for web/mobile playback

    // ===== Audio Settings =====
    '-c:a', 'aac',            // AAC codec - good quality, widely compatible
    '-b:a', '96k',            // Audio bitrate - decent quality for voice/music
    '-ac', '2',               // Force stereo output
    '-ar', '44100',           // Audio sample rate - standard for web

    // ===== Output Settings =====
    '-movflags', '+faststart',// Enable streaming playback before download complete
    '-f', 'mp4',              // Force MP4 format

    'output.mp4',
  ])
  const output = await ffmpeg.readFile('output.mp4')

  onProgress?.(1)

  signal?.removeEventListener('abort', abort)

  if (!(output instanceof Uint8Array)) {
    throw new Error('Invalid type')
  }

  return output
}

export const getThumbnail = async (file: File | Blob) => {
  const ffmpeg = await createFFmpeg(file)

  await ffmpeg.exec(['-i', 'input.mp4', '-vf', "select='eq(n,0)'", '-vframes', '1', 'thumbnail.jpg'])
  const output = await ffmpeg.readFile('thumbnail.jpg')

  if (!(output instanceof Uint8Array)) {
    throw new Error('Invalid type')
  }

  return output
}

export const getMetadata = async (file: File | Blob) => {
  const ffmpeg = new FFmpeg()
  await ffmpeg.load()
  await ffmpeg.writeFile('input.mp4', await fetchFile(file))

  await ffmpeg.ffprobe([
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=codec_name,bit_rate,width,height',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    'input.mp4',
    '-o',
    'output.txt',
  ])
  const data = await ffmpeg.readFile('output.txt')
  const str = typeof data === 'string' ? data : new TextDecoder().decode(data)

  const [codec, heightStr, widthStr, bitrateStr] = str.trim().split('\n')

  const bitrate = parseInt(bitrateStr, 10)
  const width = parseInt(widthStr, 10)
  const height = parseInt(heightStr, 10)

  return { bitrate, codec, filesize: file.size, height, width }
}
