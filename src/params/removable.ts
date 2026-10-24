import { removableKind, type RemovableKind } from '$lib/entities/moderation/dto'

export const match = (param: string): param is RemovableKind => (removableKind as string[]).includes(param)
