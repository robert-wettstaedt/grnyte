import { mutators } from '$lib/zero/mutators'
import { write } from '$lib/zero/write'
import type { FileVisibility } from './dto'

export const setFileVisibility = (fileId: string, visibility: FileVisibility) =>
  write(mutators.files.setVisibility({ fileId, visibility }))

export const setVideoSource = (fileId: string, source: null | string) =>
  write(mutators.files.setVideoSource({ fileId, source }))

export const deleteFile = (id: string) => write<{ id: string }>(mutators.files.delete({ id }))
