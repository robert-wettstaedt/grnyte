import * as schema from '$lib/db/schema'
import { areaTypeEnum, areaVisibilityEnum, ascentTypeEnum } from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { usernameRegex } from '$lib/markdown'
import { fail } from '@sveltejs/kit'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { z } from 'zod'

function getSchemaShape<Output = unknown, Def extends z.ZodTypeDef = z.ZodObjectDef, Input = Output>(
  schema: z.ZodType<Output, Def, Input>,
): z.ZodRawShape | undefined {
  const def = schema._def as unknown

  if ((def as z.ZodObjectDef).typeName === z.ZodFirstPartyTypeKind.ZodObject) {
    return (def as z.ZodObjectDef).shape()
  }

  if ((def as z.ZodEffectsDef<z.ZodObject<z.ZodRawShape>>).typeName === z.ZodFirstPartyTypeKind.ZodEffects) {
    return (def as z.ZodEffectsDef<z.ZodObject<z.ZodRawShape>>).schema._def.shape()
  }

  if ((def as z.ZodIntersectionDef).typeName === z.ZodFirstPartyTypeKind.ZodIntersection) {
    const left = getSchemaShape((def as z.ZodIntersectionDef).left)
    const right = getSchemaShape((def as z.ZodIntersectionDef).right)

    return { ...left, ...right }
  }
}

function getItemDef(shape: z.ZodRawShape, itemName: string): { typeName: z.ZodFirstPartyTypeKind; nullable: boolean } {
  let def = shape[itemName]?._def
  let nullable = false
  let defaultable = false

  if (def == null) {
    return { nullable, typeName: z.ZodFirstPartyTypeKind.ZodUndefined }
  }

  const nestedTypes = [
    z.ZodFirstPartyTypeKind.ZodOptional,
    z.ZodFirstPartyTypeKind.ZodNullable,
    z.ZodFirstPartyTypeKind.ZodDefault,
  ]

  while (nestedTypes.includes(def.typeName)) {
    if (def.typeName === z.ZodFirstPartyTypeKind.ZodNullable) {
      nullable = true
    }

    if (def.typeName === z.ZodFirstPartyTypeKind.ZodDefault) {
      defaultable = true
    }

    def = (def as z.ZodOptionalDef | z.ZodNullableDef | z.ZodDefaultDef).innerType._def
  }

  return { nullable: defaultable ? false : nullable, typeName: def.typeName }
}

export async function validateObject<Output = unknown, Def extends z.ZodTypeDef = z.ZodObjectDef, Input = Output>(
  schema: z.ZodType<Output, Def, Input>,
  data: Record<string, unknown>,
): Promise<Output> {
  const shape = getSchemaShape(schema)

  const obj = Object.entries(data).reduce(
    (obj, [key, rawValue]) => {
      if (shape == null) {
        return obj
      }

      const { nullable, typeName } = getItemDef(shape, key)

      const value = (() => {
        if (typeName === z.ZodFirstPartyTypeKind.ZodArray && Array.isArray(rawValue)) {
          return rawValue.filter(Boolean)
        }

        if (Array.isArray(rawValue)) {
          return rawValue[0]
        }

        return rawValue
      })()

      if (typeof value === 'string' && value.trim().length === 0) {
        return { ...obj, [key]: nullable ? null : undefined }
      }

      if (typeName === z.ZodFirstPartyTypeKind.ZodNumber) {
        const number = Number(value)

        if (!Number.isNaN(number)) {
          return { ...obj, [key]: number }
        }
      }

      return { ...obj, [key]: value }
    },
    {} as Record<string, unknown>,
  )

  try {
    return await schema.parseAsync(obj)
  } catch (exception) {
    const error = convertException(exception)
    throw fail(400, { ...obj, error })
  }
}

export async function validateFormData<Output = unknown, Def extends z.ZodTypeDef = z.ZodObjectDef, Input = Output>(
  schema: z.ZodType<Output, Def, Input>,
  data: FormData,
): Promise<Output> {
  const obj = Array.from(data).reduce(
    (obj, [key]) => {
      return { ...obj, [key]: data.getAll(key) }
    },
    {} as Record<string, unknown>,
  )

  return validateObject(schema, obj)
}

export type ActionFailure<T> = T & { error: string }

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
  name: z.string().trim(),
  type: z.enum(areaTypeEnum).default('area'),
  visibility: z.enum(areaVisibilityEnum).optional(),
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

export const firstAscentActionSchema = z
  .object({
    climberName: z.array(z.string().trim()).optional(),
    year: z.number().min(1950).max(new Date().getFullYear()).optional(),
  })
  .refine((x) => x.climberName != null || x.year != null, { message: 'Either climberName or year must be set' })
export type FirstAscentActionValues = z.infer<typeof firstAscentActionSchema>

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

export const createUserActionSchema = z.intersection(profileActionSchema, passwordActionSchema)
export type CreateUserActionValues = z.infer<typeof createUserActionSchema>

export const validateUsername = async (username: string, db: PostgresJsDatabase<typeof schema>) => {
  const userWithUsername = await db.query.users.findFirst({ where: (table, { eq }) => eq(table.username, username) })

  if (userWithUsername != null) {
    return 'User with username already exists'
  }

  const match = username.match(usernameRegex)
  if (match?.[0] == null) {
    return 'Invalid username'
  }

  if (match[0].length !== username.length) {
    const character = match[0][0] === username[0] ? username[match[0].length] : username[0]

    return `Username cannot contain character "${character}"`
  }
}

export const validatePassword = (data: PasswordActionValues) => {
  if (data.password !== data.passwordConfirmation) {
    return 'Passwords must match'
  }
}
