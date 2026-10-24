import { m } from '$lib/paraglide/messages'
import type { ModerationGround, RemovableKind } from './dto'

export const GROUND_LABELS: Record<ModerationGround, () => string> = {
  harassment: m.moderation_groundHarassment,
  impersonation: m.moderation_groundImpersonation,
  personal_data: m.moderation_groundPersonalData,
  spam: m.moderation_groundSpam,
  terms_breach: m.moderation_groundTermsBreach,
  unlawful: m.moderation_groundUnlawful,
}

export const KIND_LABELS: Record<RemovableKind, () => string> = {
  area: m.common_area,
  ascent: m.common_ascent,
  block: m.common_block,
  comment: m.moderation_kindComment,
  file: m.common_media,
  route: m.common_route,
  topo: m.moderation_kindTopo,
}
