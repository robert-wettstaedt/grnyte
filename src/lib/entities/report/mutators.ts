import { removalTargetSchema } from '$lib/entities/moderation/dto'
import { defineMutator } from '@rocicorp/zero'
import { fileReportSchema } from './dto'

const waitForServer = async () => {}

export const reportsMutatorDefs = {
  reports: {
    dismiss: defineMutator(removalTargetSchema, waitForServer),
    file: defineMutator(fileReportSchema, waitForServer),
  },
}
