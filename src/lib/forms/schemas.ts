import * as schema from '$lib/db/schema'
import { areaTypeEnum, ascentTypeEnum } from '$lib/db/schema'
import { type ActionFailure as KitActionFailure } from '@sveltejs/kit'
import { z } from 'zod'

export const stringToInt = z.codec(
  z.string({ error: 'form.required' }).regex(z.regexes.integer, 'form.numInvalid'),
  z.int(),
  {
    decode: (str) => Number.parseInt(str, 10),
    encode: (num) => num.toString(),
  },
)

export const stringToIntOptional = z.codec(
  z.union([z.literal(''), z.string({ error: 'form.required' }).regex(z.regexes.integer, 'form.numInvalid')]),
  z.int().optional(),
  {
    decode: (str) => (str === '' ? undefined : Number.parseInt(str, 10)),
    encode: (num) => (num == null ? '' : num.toString()),
  },
)

export const stringToNumber = z.codec(
  z.string({ error: 'form.required' }).regex(z.regexes.number, 'form.numInvalid'),
  z.number(),
  {
    decode: (str) => Number.parseFloat(str),
    encode: (num) => num.toString(),
  },
)

export const stringToNumberOptional = z.codec(
  z.union([z.literal(''), z.string({ error: 'form.required' }).regex(z.regexes.number, 'form.numInvalid')]),
  z.number().optional(),
  {
    decode: (str) => (str === '' ? undefined : Number.parseFloat(str)),
    encode: (num) => (num == null ? '' : num.toString()),
  },
)

export type ActionFailure<T> = KitActionFailure<T & { error: string }>

export const addFileActionSchema = z.object({
  bunnyVideoIds: z.string().optional(),
  folderName: z.string().optional(),
})
export type AddFileActionValues = z.infer<typeof addFileActionSchema>

export const areaActionSchema = z.object({
  description: z.string().optional().default(''),
  id: stringToInt.optional(),
  name: z
    .string({ error: 'form.required' })
    .trim()
    .min(3, { error: JSON.stringify({ message: 'form.charsMin', params: { count: 3 } }) }),
  parentFk: stringToInt.optional(),
  regionFk: stringToInt,
  type: z.enum(areaTypeEnum).default('area'),
})
export type AreaActionValuesIn = z.input<typeof areaActionSchema>
export type AreaActionValues = z.output<typeof areaActionSchema>

export const blockActionSchema = z.intersection(
  z.object({
    areaId: stringToInt,
    name: z
      .string()
      .trim()
      .min(1, { error: JSON.stringify({ message: 'form.charsMin', params: { count: 1 } }) }),
  }),
  addFileActionSchema,
)
export type BlockActionValuesIn = z.input<typeof blockActionSchema>
export type BlockActionValues = z.output<typeof blockActionSchema>

export const routeActionSchema = z.object({
  blockId: stringToInt,
  description: z.string().default(''),
  gradeFk: stringToIntOptional,
  name: z.string().trim().default(''),
  rating: stringToIntOptional.refine(
    (value) => value == null || (value >= 1 && value <= 3),
    JSON.stringify({ message: 'form.numBetween', params: { min: 1, max: 3 } }),
  ),
  redirect: z.string().optional(),
  tags: z.array(z.string()).optional(),
})
export type RouteActionValuesIn = z.input<typeof routeActionSchema>
export type RouteActionValues = z.output<typeof routeActionSchema>

export const ascentActionSchema = z.intersection(
  z.object({
    dateTime: z.iso.date(),
    filePaths: z.array(z.string()).optional(),
    gradeFk: stringToIntOptional,
    humidity: stringToIntOptional,
    notes: z.string().optional(),
    rating: stringToIntOptional.refine(
      (value) => value == null || (value >= 1 && value <= 3),
      JSON.stringify({ message: 'form.numBetween', params: { min: 1, max: 3 } }),
    ),
    temperature: stringToIntOptional,
    type: z.enum(ascentTypeEnum, 'form.required'),
  }),
  addFileActionSchema,
)
export type AscentActionValuesIn = z.input<typeof ascentActionSchema>
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
  name: z.string().min(3, { error: JSON.stringify({ message: 'form.charsMin', params: { count: 3 } }) }),
  settings: z.string().optional(),
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
    acceptTerms: z.literal('on', { message: 'form.acceptTerms' }),
  }),
)
export type CreateUserActionValues = z.infer<typeof createUserActionSchema>

export const regionMemberActionSchema = z.object({
  role: z.enum(schema.appRole.enumValues).nullish(),
  userId: z.number(),
  regionId: z.number(),
})
export type RegionMemberActionValues = z.infer<typeof regionMemberActionSchema>
