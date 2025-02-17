import { areaTypeEnum, areaVisibilityEnum, ascentTypeEnum, topoRouteTopTypeEnum } from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { fail } from '@sveltejs/kit'
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

function getItemDef(shape: z.ZodRawShape, itemName: string): z.ZodFirstPartyTypeKind | undefined {
  const def = shape[itemName]?._def

  if (def == null) {
    return undefined
  }

  if ((def as z.ZodOptionalDef).typeName === z.ZodFirstPartyTypeKind.ZodOptional) {
    return (def as z.ZodOptionalDef).innerType._def.typeName
  }

  if ((def as z.ZodDefaultDef).typeName === z.ZodFirstPartyTypeKind.ZodDefault) {
    return (def as z.ZodDefaultDef).innerType._def.typeName
  }

  return def.typeName
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

      const typeName = getItemDef(shape, key)

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
        return obj
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
  folderName: z.string(),
})
export type AddFileActionValues = z.infer<typeof addFileActionSchema>

export const addOptionalFileActionSchema = z.object({
  folderName: z.string().optional(),
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
  gradeFk: z.number().optional(),
  name: z.string().trim().default(''),
  rating: z.number().min(1).max(3).optional(),
  tags: z.array(z.string()).optional(),
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
    filePaths: z.array(z.string()).optional(),
    gradeFk: z.number().optional(),
    notes: z.string().optional(),
    rating: z.number().min(1).max(3).optional(),
    type: z.enum(ascentTypeEnum),
  }),
  addOptionalFileActionSchema,
)
export type AscentActionValues = z.infer<typeof ascentActionSchema>

export const saveTopoActionSchema = z.object({
  id: z.number(),
  path: z.string(),
  routeFk: z.number(),
  topoFk: z.number(),
  topType: z.enum(topoRouteTopTypeEnum),
})
export type SaveTopoActionValues = z.infer<typeof saveTopoActionSchema>

export const addTopoActionSchema = z.object({
  routeFk: z.number(),
  topoFk: z.number(),
})
export type AddTopoActionValues = z.infer<typeof addTopoActionSchema>

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
