import { resolve } from '$app/paths'
import type * as z from '$lib/forms/zod'
import { getLocale } from '$lib/paraglide/runtime'
import { mutators } from '$lib/zero/mutators'
import { write } from '$lib/zero/write'
import { entityHref } from '../href'
import type {
  inviteMemberSchema,
  memberRoleSchema,
  regionActionSchema,
  regionCreateSchema,
  regionMapLayersSchema,
  RemovedMemberSnapshot,
  RevokedInvitationSnapshot,
} from './dto'

/** No destination: the Zero client is session scoped, so the caller reloads the document. */
export const createRegion = (values: z.input<typeof regionCreateSchema>) =>
  write<{ regionId: number }>(mutators.regions.create(values))

export const updateRegion = (values: z.input<typeof regionActionSchema>) =>
  write(mutators.regions.update(values), { redirectTo: entityHref('regions', Number(values.id)) })

export const updateRegionMapLayers = (values: z.input<typeof regionMapLayersSchema>) =>
  write(mutators.regions.updateMapLayers(values), { redirectTo: entityHref('regions', Number(values.id)) })

export const addRegionTag = (regionFk: number, name: string) => write(mutators.regions.addTag({ name, regionFk }))

export const renameRegionTag = (regionFk: number, from: string, to: string) =>
  write(mutators.regions.renameTag({ from, regionFk, to }))

export const removeRegionTag = (regionFk: number, name: string) => write(mutators.regions.removeTag({ name, regionFk }))

/** The sender's locale rides along: it is the mail's fallback language for an invitee with no account. */
export const inviteRegionMember = (values: z.input<typeof inviteMemberSchema>) =>
  write<{ email: string }>(mutators.regions.invite({ ...values, locale: getLocale() }))

export const resendRegionInvitation = (invitationFk: number) =>
  write<{ email: string }>(mutators.regions.resendInvitation({ invitationFk, locale: getLocale() }))

export const revokeRegionInvitation = (invitationFk: number) =>
  write<RevokedInvitationSnapshot>(mutators.regions.revokeInvitation({ invitationFk }))

export const restoreRegionInvitation = (snapshot: RevokedInvitationSnapshot) =>
  write(mutators.regions.restoreInvitation(snapshot))

export const acceptMyInvitation = (invitationFk: number) =>
  write<{ regionFk: number; regionName: string }>(mutators.regions.acceptInvitation({ invitationFk }))

export const updateRegionMemberRole = (values: z.input<typeof memberRoleSchema>) =>
  write(mutators.regions.updateMemberRole(values))

export const removeRegionMember = (regionFk: number, userFk: number) =>
  write<RemovedMemberSnapshot>(mutators.regions.removeMember({ regionFk, userFk }))

export const restoreRegionMember = (snapshot: z.input<typeof memberRoleSchema>) =>
  write(mutators.regions.restoreMember(snapshot))

export const leaveRegion = (regionFk: number) =>
  write(mutators.regions.leave({ regionFk }), { redirectTo: resolve('/(app)/settings') })
