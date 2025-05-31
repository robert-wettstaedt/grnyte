import * as schema from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { usernameRegex } from '$lib/markdown'
import { fail } from '@sveltejs/kit'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { z } from 'zod/v4'
import * as core from 'zod/v4/core'
import type { PasswordActionValues } from './schemas'

function getSchemaShape<Output = unknown, Input = Output>(schema: z.ZodType<Output, Input>): z.ZodRawShape | undefined {
  const def = schema.def as core.$ZodTypeDef

  if (def.type === 'object') {
    return (def as core.$ZodObjectDef).shape
  }

  if (def.type === 'intersection') {
    const left = getSchemaShape((def as core.$ZodIntersectionDef).left as z.ZodType)
    const right = getSchemaShape((def as core.$ZodIntersectionDef).right as z.ZodType)

    return { ...left, ...right }
  }

  if (def.type === 'union') {
    const left = getSchemaShape((def as core.$ZodUnionDef).options[0] as z.ZodType)
    const right = getSchemaShape((def as core.$ZodUnionDef).options[1] as z.ZodType)

    return { ...left, ...right }
  }
}

function getItemDef(shape: z.ZodRawShape, itemName: string): { type: core.$ZodTypeDef['type']; nullable: boolean } {
  let def = (shape[itemName] as z.ZodType | undefined)?.def
  let nullable = false
  let defaultable = false

  if (def == null) {
    return { nullable, type: 'undefined' }
  }

  const nestedTypes: core.$ZodTypeDef['type'][] = ['optional', 'nullable', 'default']

  while (nestedTypes.includes(def!.type)) {
    if (def!.type === 'nullable') {
      nullable = true
    }

    if (def!.type === 'default') {
      defaultable = true
    }

    def = ((def as core.$ZodOptionalDef | core.$ZodNullableDef | core.$ZodDefaultDef).innerType as z.ZodType).def
  }

  return { nullable: defaultable ? false : nullable, type: def.type }
}

export async function validateObject<Output = unknown, Input = Output>(
  schema: z.ZodType<Output, Input>,
  data: Record<string, unknown>,
): Promise<Output> {
  const shape = getSchemaShape(schema)

  const obj = Object.entries(data).reduce(
    (obj, [key, rawValue]) => {
      if (shape == null) {
        return obj
      }

      const { nullable, type } = getItemDef(shape, key)

      const value = (() => {
        if (type === 'array' && Array.isArray(rawValue)) {
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

      if (type === 'number') {
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

export async function validateFormData<Output = unknown, Input = Output>(
  schema: z.ZodType<Output, Input>,
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
