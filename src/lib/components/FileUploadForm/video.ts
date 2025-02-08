import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm'

const settings = {
  audioBitrate: '128k',
  audioCodec: 'aac',
  frameRate: '30',
  videoBitrate: '2500k',
  videoCodec: 'libx264',
  videoFilter: "scale='max(720,720*dar)':'max(720,720/dar)':force_original_aspect_ratio=1",
}

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

  await ffmpeg.exec([
    '-i',
    'input.mp4',
    '-b:a',
    settings.audioBitrate,
    '-c:a',
    settings.audioCodec,
    '-r',
    settings.frameRate,
    '-b:v',
    settings.videoBitrate,
    '-c:v',
    settings.videoCodec,
    '-vf',
    settings.videoFilter,
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
