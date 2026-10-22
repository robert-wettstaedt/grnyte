import { defineMutator } from '@rocicorp/zero'
import {
  invitationSchema,
  inviteMemberSchema,
  memberRoleSchema,
  memberSchema,
  regionActionSchema,
  regionCreateSchema,
  regionFkSchema,
  regionMapLayersSchema,
  regionTagSchema,
  removeRegionTagSchema,
  renameRegionTagSchema,
} from './dto'

// Validate and write nothing: every one of these is a form, a create, a delete, or a write whose
// rules (locks, seats, the owner) only the server can apply.
const waitForServer = async () => {}

export const regionsMutatorDefs = {
  regions: {
    acceptInvitation: defineMutator(invitationSchema, waitForServer),
    addTag: defineMutator(regionTagSchema, waitForServer),
    create: defineMutator(regionCreateSchema, waitForServer),
    invite: defineMutator(inviteMemberSchema, waitForServer),
    leave: defineMutator(regionFkSchema, waitForServer),
    removeMember: defineMutator(memberSchema, waitForServer),
    removeTag: defineMutator(removeRegionTagSchema, waitForServer),
    renameTag: defineMutator(renameRegionTagSchema, waitForServer),
    resendInvitation: defineMutator(invitationSchema, waitForServer),
    restoreInvitation: defineMutator(invitationSchema, waitForServer),
    restoreMember: defineMutator(memberRoleSchema, waitForServer),
    revokeInvitation: defineMutator(invitationSchema, waitForServer),
    update: defineMutator(regionActionSchema, waitForServer),
    updateMapLayers: defineMutator(regionMapLayersSchema, waitForServer),
    updateMemberRole: defineMutator(memberRoleSchema, waitForServer),
  },
}
