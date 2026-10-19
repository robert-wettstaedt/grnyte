import type { WriteRejection } from '$lib/zero/write'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { RemoteFormIssue } from '@sveltejs/kit'
import { untrack } from 'svelte'

export type FormStore<Input extends Values, Output = Input> = {
  /** The form's `oninput`: a named top-level control writes its value. Bracketed names belong to
   *  components that write their own value with `set`. */
  capture(event: Event): void
  fields: { [K in keyof Input]-?: StoreField<Input[K]> } & {
    allIssues(): RemoteFormIssue[] | undefined
    set(values: Partial<Input>): void
    value(): Partial<Input>
  }
  /** A refusal: on its field, or on the form when it names none the form holds. */
  setIssue(field: null | string | undefined, message: string): void
  /** Validates, then runs `run` on a snapshot of the values; a `WriteRejection` lands on its field.
   *  Any other throw is not a refusal and propagates. */
  submit<T>(run: (values: Input) => Promise<T>): Promise<SubmitOutcome<T>>
  validate(): Promise<{ ok: false } | { ok: true; value: Output }>
}

export interface StoreField<V> {
  as(type: 'email' | 'hidden' | 'password' | 'select' | 'text'): {
    'aria-invalid'?: 'true'
    name: string
    type?: 'email' | 'hidden' | 'password' | 'text'
    value: string
  }
  issues(): RemoteFormIssue[] | undefined
  set(value: V): void
  value(): undefined | V
}

/** How a submit ended: `invalid` and `refused` left issues on the form, `offline` wrote nothing. */
export type SubmitOutcome<T> = { kind: 'done'; result: T } | { kind: 'invalid' | 'offline' | 'refused' }

type Values = Record<string, unknown>

/**
 * A form's fields held in one store, so a submit sends exactly what the store holds, including
 * values kept outside text inputs, and a server refusal can land on its field. The field methods
 * mirror a remote form's, so field components take either.
 */
export function createFormStore<Input extends Values, Output = Input>(
  schema: StandardSchemaV1<Input, Output>,
): FormStore<Input, Output> {
  let values = $state<Values>({})
  let issues = $state<Record<string, string[]>>({})
  // Fields some component asked for, where an issue can land. Plain: they register while rendering.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const rendered = new Set<string>()
  const home = (key: null | string | undefined) => (key != null && rendered.has(key) ? key : '')

  // Untracked, and a no-op for an unchanged value: an effect mirroring a field must neither re-run
  // when an issue lands nor clear the issue it is not changing.
  // Arrays by content: a mirror rebuilds its lists on every run.
  const unchanged = (before: unknown, after: unknown) =>
    Object.is(before, after) ||
    (Array.isArray(before) && Array.isArray(after) && JSON.stringify(before) === JSON.stringify(after))
  const write = (key: string, value: unknown) =>
    untrack(() => {
      if (unchanged(values[key], value)) return
      values[key] = value
      delete issues[key]
    })

  const field = (key: string): StoreField<unknown> => {
    rendered.add(key)
    return {
      as: (type) => ({
        ...(issues[key] == null ? {} : { 'aria-invalid': 'true' as const }),
        ...(type === 'select' ? {} : { type }),
        name: key,
        value: values[key] == null ? '' : String(values[key]),
      }),
      issues: () => issues[key]?.map((message) => ({ message, path: [key] })),
      set: (value) => write(key, value),
      value: () => values[key],
    }
  }

  const all = {
    allIssues: () =>
      Object.entries(issues).flatMap(([key, messages]) =>
        messages.map((message) => ({ message, path: key === '' ? [] : [key] })),
      ),
    set: (next: Values) => {
      values = { ...next }
      issues = {}
    },
    value: () => values,
  }

  const fields = new Proxy(all, {
    get: (target, key) => (typeof key === 'string' && !(key in target) ? field(key) : Reflect.get(target, key)),
  }) as unknown as FormStore<Input, Output>['fields']

  const setIssue = (key: null | string | undefined, message: string) => {
    issues = { ...issues, [home(key)]: [message] }
  }

  return {
    capture: (event) => {
      const target = event.target as HTMLInputElement | null
      if (target?.name && !/[[.]/.test(target.name)) write(target.name, target.value)
    },
    fields,
    setIssue,
    submit: async (run) => {
      if (!(await validate()).ok) {
        return { kind: 'invalid' }
      }
      try {
        // A snapshot: Zero freezes a mutation's arguments, and a live proxy refuses that.
        return { kind: 'done', result: await run($state.snapshot(values) as Input) }
      } catch (cause) {
        const rejection = cause as Partial<WriteRejection> | undefined
        if (rejection?.body == null) throw cause
        if (rejection.offline) return { kind: 'offline' }
        setIssue(rejection.body.field, rejection.body.message)
        return { kind: 'refused' }
      }
    },
    validate,
  }

  async function validate(): Promise<{ ok: false } | { ok: true; value: Output }> {
    const result = await schema['~standard'].validate(values)
    if (result.issues == null) {
      return { ok: true, value: result.value }
    }
    const next: Record<string, string[]> = {}
    for (const issue of result.issues) {
      const [head] = issue.path ?? []
      const key = head == null ? '' : String(typeof head === 'object' ? head.key : head)
      ;(next[home(key)] ??= []).push(issue.message)
    }
    issues = next
    return { ok: false }
  }
}
