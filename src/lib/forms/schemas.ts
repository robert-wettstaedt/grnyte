import * as schema from '$lib/db/schema'
import { areaTypeEnum, ascentTypeEnum } from '$lib/db/schema'
import { type ActionFailure as KitActionFailure } from '@sveltejs/kit'
import { z } from 'zod'

export type ActionFailure<T> = KitActionFailure<T & { error: string }>

export const addFileActionSchema = z.object({
  bunnyVideoIds: z.array(z.string()).nullish(),
  folderName: z.string(),
})
export type AddFileActionValues = z.infer<typeof addFileActionSchema>

export const addOptionalFileActionSchema = z.object({
  bunnyVideoIds: z.array(z.string()).nullish(),
  folderName: z.string().nullable().optional(),
})
export type AddOptionalFileActionValues = z.infer<typeof addOptionalFileActionSchema>

export type AreaActionValues = z.infer<typeof areaActionSchema>
export const areaActionSchema = z.object({
  description: z.string().nullable().default(''),
  id: z.number().nullish(),
  name: z.string().trim(),
  parentFk: z.number().nullish(),
  regionFk: z.number(),
  type: z.enum(areaTypeEnum).default('area'),
})

export type BlockActionValues = z.infer<typeof blockActionSchema>
export const blockActionSchema = z.intersection(
  z.object({
    name: z.string(),
  }),
  addOptionalFileActionSchema,
)

export const routeActionSchema = z.object({
  description: z.string().nullable().default(''),
  gradeFk: z.number().nullable().optional(),
  name: z.string().trim().default(''),
  rating: z.number().min(1).max(3).nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
})
export type RouteActionValues = z.infer<typeof routeActionSchema>

export const ascentActionSchema = z.intersection(
  z.object({
    dateTime: z.string().date(),
    filePaths: z.array(z.string()).nullable().optional(),
    gradeFk: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
    rating: z.number().min(1).max(3).nullable().optional(),
    type: z.enum(ascentTypeEnum),
  }),
  addOptionalFileActionSchema,
)
export type AscentActionValues = z.infer<typeof ascentActionSchema>

export const tagActionSchema = z.object({
  id: z.string(),
})
export type TagActionValues = z.infer<typeof tagActionSchema>

export const regionSettingsSchema = z.object({
  mapLayers: z
    .array(
      z.object({
        attributions: z.array(z.string()).nullish(),
        minZoom: z.number().nullish(),
        name: z.string(),
        opacity: z.number().nullish(),
        params: z.record(z.string(), z.string()).nullish(),
        type: z.literal('wms'),
        url: z.string(),
      }),
    )
    .default([]),
})
export type RegionSettings = z.infer<typeof regionSettingsSchema>

export const regionActionSchema = z.object({
  name: z.string(),
  settings: z.string().nullish(),
})
export type RegionActionValues = z.infer<typeof regionActionSchema>

export const userExternalResourceActionSchema = z.object({
  cookie8a: z.string().trim().optional(),
  cookie27crags: z.string().trim().optional(),
  cookieTheCrag: z.string().trim().optional(),
})
export type UserExternalResourceActionValues = z.infer<typeof userExternalResourceActionSchema>

export const addRoleActionSchema = z.object({
  authUserFk: z.string(),
})
export type AddRoleActionValues = z.infer<typeof addRoleActionSchema>

export const profileActionSchema = z.object({
  email: z.string().email(),
  username: z.string().trim(),
})
export type ProfileActionValues = z.infer<typeof profileActionSchema>

export const passwordActionSchema = z.object({
  password: z.string(),
  passwordConfirmation: z.string(),
})
export type PasswordActionValues = z.infer<typeof passwordActionSchema>

export const changePasswordActionSchema = z.intersection(
  z.object({
    currentPassword: z.string(),
  }),
  passwordActionSchema,
)
export type ChangePasswordActionValues = z.infer<typeof changePasswordActionSchema>

const baseCreateUserActionSchema = z.intersection(profileActionSchema, passwordActionSchema)
export const createUserActionSchema = z.intersection(
  baseCreateUserActionSchema,
  z.object({
    acceptTerms: z.literal('on', {
      message: 'You must accept the Terms of Service and Privacy Policy to create an account',
    }),
  }),
)
export type CreateUserActionValues = z.infer<typeof createUserActionSchema>

export const subscribePushSubscriptionActionSchema = z.object({
  pushSubscriptionId: z.number().nullable().optional(),
  subscription: z.string(),
})
export type SubscribePushSubscriptionActionValues = z.infer<typeof subscribePushSubscriptionActionSchema>

export const unsubscribePushSubscriptionActionSchema = z.object({
  pushSubscriptionId: z.number(),
})
export type UnsubscribePushSubscriptionActionValues = z.infer<typeof unsubscribePushSubscriptionActionSchema>

export const pushSubscriptionSchema = z.object({
  endpoint: z.string(),
  expirationTime: z.number().nullable().optional(),
  p256dh: z.string(),
  auth: z.string(),
})
export type PushSubscription = z.infer<typeof pushSubscriptionSchema>

export const notificationsActionSchema = z.object({
  notifyModerations: z.string().nullable().optional(),
  notifyNewAscents: z.string().nullable().optional(),
  notifyNewUsers: z.string().nullable().optional(),
})
export type NotificationsActionValues = z.infer<typeof notificationsActionSchema>

export const regionMemberActionSchema = z.object({
  role: z.enum(schema.appRole.enumValues).nullish(),
  userId: z.number(),
  regionId: z.number(),
})
export type RegionMemberActionValues = z.infer<typeof regionMemberActionSchema>
