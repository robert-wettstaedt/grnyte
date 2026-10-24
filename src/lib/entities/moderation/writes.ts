import { mutators } from '$lib/zero/mutators'
import { write } from '$lib/zero/write'
import type { RemovableKind } from './dto'

export const undoRemoval = (kind: RemovableKind, id: string) => write(mutators.moderation.undoRemoval({ id, kind }))
