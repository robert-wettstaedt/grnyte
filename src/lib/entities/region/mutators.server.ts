import { PUBLIC_ORIGIN } from '$env/static/public'
import { baseLocale } from '$lib/paraglide/runtime'
import { asCaller, asPrivileged, defineServerMutator } from '$lib/zero/serverMutator.server'
import { createRegionIn } from './create.server'
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
import {
  addRegionTagRow,
  removeRegionTagRow,
  renameRegionTagRow,
  updateRegionMapLayersRow,
  updateRegionRow,
} from './edit.server'
import {
  acceptMyInvitationRow,
  inviteRegionMemberRow,
  resendRegionInvitationRow,
  restoreRegionInvitationRow,
  revokeRegionInvitationRow,
} from './invitations.server'
import type { MailContext } from './invite.server'
import {
  leaveRegionRow,
  removeRegionMemberRow,
  restoreRegionMemberRow,
  updateRegionMemberRoleRow,
} from './members.server'

// The configured origin, and the sender's locale from the client: this request is zero-cache's.
const mail = (locale: string | undefined): MailContext => ({
  ambientLocale: locale ?? baseLocale,
  origin: PUBLIC_ORIGIN,
})

export const regionsServerMutatorDefs = {
  regions: {
    // Privileged: the invitee is not a member yet, so nothing RLS allows could add them.
    acceptInvitation: defineServerMutator(invitationSchema, async ({ args, ctx, tx }) => {
      const { data } = await asPrivileged(tx, (db) =>
        acceptMyInvitationRow(args, { ...ctx, authUserId: ctx.claims.sub, db, email: ctx.claims.email }),
      )
      return data
    }),
    addTag: defineServerMutator(regionTagSchema, async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => addRegionTagRow(args, { ...ctx, db }))
    }),
    // Privileged: a founder administers nothing yet. The cap is checked under the founder's lock.
    create: defineServerMutator(regionCreateSchema, async ({ args, ctx, tx }) => {
      const region = await asPrivileged(tx, (db) =>
        createRegionIn(db, { authUserId: ctx.user.authUserFk, name: args.name, userId: ctx.user.id }),
      )
      return { regionId: region.id }
    }),
    invite: defineServerMutator(inviteMemberSchema, async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => inviteRegionMemberRow(args, { ...ctx, db }, mail(args.locale)))
      return { email: data.email }
    }),
    leave: defineServerMutator(regionFkSchema, async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => leaveRegionRow(args, { ...ctx, db }))
    }),
    removeMember: defineServerMutator(memberSchema, async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => removeRegionMemberRow(args, { ...ctx, db }))
      return data
    }),
    removeTag: defineServerMutator(removeRegionTagSchema, async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => removeRegionTagRow(args, { ...ctx, db }))
    }),
    renameTag: defineServerMutator(renameRegionTagSchema, async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => renameRegionTagRow(args, { ...ctx, db }))
    }),
    resendInvitation: defineServerMutator(invitationSchema, async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) =>
        resendRegionInvitationRow(args, { ...ctx, db }, mail(args.locale)),
      )
      return { email: data.email }
    }),
    restoreInvitation: defineServerMutator(invitationSchema, async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => restoreRegionInvitationRow(args, { ...ctx, db }))
    }),
    restoreMember: defineServerMutator(memberRoleSchema, async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => restoreRegionMemberRow(args, { ...ctx, db }))
    }),
    revokeInvitation: defineServerMutator(invitationSchema, async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => revokeRegionInvitationRow(args, { ...ctx, db }))
      return data
    }),
    update: defineServerMutator(regionActionSchema, async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => updateRegionRow(args, { ...ctx, db }))
    }),
    updateMapLayers: defineServerMutator(regionMapLayersSchema, async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => updateRegionMapLayersRow(args, { ...ctx, db }))
    }),
    updateMemberRole: defineServerMutator(memberRoleSchema, async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => updateRegionMemberRoleRow(args, { ...ctx, db }))
    }),
  },
}
