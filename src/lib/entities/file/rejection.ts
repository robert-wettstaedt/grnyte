/**
 * Copy for a rejected image pick. Separate from `upload.ts` because that module is imported
 * by `files.remote.ts` and `guards.server.ts` and is deliberately free of i18n; the rule for
 * what gets rejected lives there, only the wording lives here. Shared so the drop zone and
 * the topo editor's own picker say the same thing.
 */
import { m } from '$lib/paraglide/messages'
import { formatFileSize, MAX_IMAGE_SIZE, type ImageRejection } from './upload'

export const imageRejectionMessage = (rejection: ImageRejection): string =>
  rejection === 'invalidType' ? m.upload_invalidType() : m.upload_tooLarge({ size: formatFileSize(MAX_IMAGE_SIZE) })
