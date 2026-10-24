import { mutators } from '$lib/zero/mutators'
import { write } from '$lib/zero/write'
import type { RemovableKind } from './dto'

export const undoRemoval = (kind: RemovableKind, id: string, decisionId?: number) =>
  write(mutators.moderation.undoRemoval({ decisionId, id, kind }))
