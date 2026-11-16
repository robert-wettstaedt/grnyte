import * as z from '$lib/forms/zod'
/**
 * The frozen `v1` shapes against the committed `v1.contract.json`: requests and responses only
 * widen. A break is a `v2`, never an edit of the file; a compatible addition rewrites the file.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { POST as passwordChange } from '../../../routes/api/app/v1/password/change/+server'
import { appCall } from './appRequest.fixture'
import { V1, V1_FIXED_ERRORS } from './v1'

vi.mock('$lib/auth/passwordPolicy.server', () => ({ checkPassword: async () => 'breached' }))

type Schema = {
  anyOf?: Schema[]
  const?: unknown
  enum?: unknown[]
  items?: Schema
  properties?: Record<string, Schema>
  required?: string[]
  type?: string
}
type Side = 'request' | 'response'

const FILE = join(process.cwd(), 'src/lib/auth/app/v1.contract.json')

const render = () => ({
  endpoints: Object.fromEntries(
    Object.entries(V1).map(([path, { request, response }]) => [
      path,
      { request: z.toJSONSchema(request, { io: 'input' }), response: z.toJSONSchema(response, { io: 'output' }) },
    ]),
  ),
  fixedErrors: Object.fromEntries(
    Object.entries(V1_FIXED_ERRORS).map(([code, shape]) => [code, z.toJSONSchema(shape)]),
  ),
})

const subset = (small: unknown[] = [], big: unknown[] = []) => small.every((value) => big.includes(value))

type Child = [step: string, was: Schema, now: Schema | undefined]

/** What `now` breaks of `was` for an app built against `was`, by path. */
function breaks(was: Schema, now: Schema, side: Side, at = ''): string[] {
  if (was.type !== now.type || JSON.stringify(was.const) !== JSON.stringify(now.const)) return [`${at}: type`]
  return [
    ...enumBreaks(was.enum, now.enum, side, at),
    ...requiredBreaks(was.required ?? [], now.required ?? [], side, at),
    ...children(was, now).flatMap(([step, before, after]) =>
      after == null ? [`${at}${step}: removed`] : breaks(before, after, side, `${at}${step}`),
    ),
  ]
}

const children = (was: Schema, now: Schema): Child[] => [
  ...Object.entries(was.properties ?? {}).map(([key, property]): Child => [`.${key}`, property, now.properties?.[key]]),
  ...(was.items == null ? [] : [['[]', was.items, now.items] satisfies Child]),
  ...(was.anyOf ?? []).map((option, i): Child => [`|${i}`, option, now.anyOf?.[i]]),
]

/** A request enum may only gain values, a response enum only lose them. */
const enumBreaks = (was: undefined | unknown[], now: undefined | unknown[], side: Side, at: string) =>
  was == null || (side === 'request' ? subset(was, now) : subset(now, was)) ? [] : [`${at}: enum narrowed`]

/** A request may not require more; a response may not stop always sending a field. */
const requiredBreaks = (was: string[], now: string[], side: Side, at: string) =>
  side === 'request'
    ? now.filter((key) => !was.includes(key)).map((key) => `${at}.${key}: now required`)
    : was.filter((key) => !now.includes(key)).map((key) => `${at}.${key}: no longer always sent`)

function contractBreaks(was: ReturnType<typeof render>, now: ReturnType<typeof render>): string[] {
  const endpoints = Object.entries(was.endpoints).flatMap(([path, shapes]) => {
    const next = now.endpoints[path]
    if (next == null) return [`${path}: removed`]
    return [
      ...breaks(shapes.request as Schema, next.request as Schema, 'request', `${path} request`),
      ...breaks(shapes.response as Schema, next.response as Schema, 'response', `${path} response`),
    ]
  })
  const fixed = Object.keys(was.fixedErrors).filter(
    (code) => JSON.stringify(was.fixedErrors[code]) !== JSON.stringify(now.fixedErrors[code]),
  )
  return [...endpoints, ...fixed.map((code) => `${code}: fixed error changed`)]
}

describe('the v1 contract', () => {
  it('only widens the committed shapes, and the file holds the current ones', () => {
    const now = render()
    if (!existsSync(FILE)) {
      writeFileSync(FILE, `${JSON.stringify(now, null, 2)}\n`)
      throw new Error('v1.contract.json written: commit it and run again')
    }
    const was = JSON.parse(readFileSync(FILE, 'utf8')) as ReturnType<typeof render>
    expect(contractBreaks(was, now)).toEqual([])
    // Compatible, so the file is extended; the diff is what review sees.
    writeFileSync(FILE, `${JSON.stringify(now, null, 2)}\n`)
  })

  it('refuses a request field made required and a removed response field, and lets an optional field in', () => {
    const shape = (request: z.ZodMiniType, response: z.ZodMiniType) => ({
      endpoints: { x: { request: z.toJSONSchema(request), response: z.toJSONSchema(response) } },
      fixedErrors: {},
    })
    const was = shape(z.object({ a: z.optional(z.string()) }), z.object({ id: z.string(), ok: z.boolean() }))

    expect(
      contractBreaks(was, shape(z.object({ a: z.string() }), z.object({ id: z.string(), ok: z.boolean() }))),
    ).toEqual(['x request.a: now required'])
    expect(contractBreaks(was, shape(z.object({ a: z.optional(z.string()) }), z.object({ ok: z.boolean() })))).toEqual([
      'x response.id: no longer always sent',
      'x response.id: removed',
    ])
    expect(
      contractBreaks(
        was,
        shape(
          z.object({ a: z.optional(z.string()), b: z.optional(z.string()) }),
          z.object({ id: z.string(), ok: z.boolean() }),
        ),
      ),
    ).toEqual([])
  })

  it("answers a shared body's formError refusal as a plain code, never the web's JSON string", async () => {
    const claims = { email: 'app@grnyte.test', session_id: crypto.randomUUID(), sub: crypto.randomUUID() }
    const response = await appCall(passwordChange, 'password/change', {
      body: { password: 'a-new-Passw0rd!' },
      locals: { claims, user: {} },
    })

    expect(await response.json()).toEqual({ error: { code: 'auth_passwordBreached', field: 'password' } })
  })
})
