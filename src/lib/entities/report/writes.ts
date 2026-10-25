import type { RemovableKind } from '$lib/entities/moderation/dto'
import { mutators } from '$lib/zero/mutators'
import { write } from '$lib/zero/write'
import type { FileReportInput } from './dto'

export const fileReport = (input: FileReportInput) => write(mutators.reports.file(input))

export const dismissReports = (kind: RemovableKind, id: string) => write(mutators.reports.dismiss({ id, kind }))
