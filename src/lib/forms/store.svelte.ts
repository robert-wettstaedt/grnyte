import type { WriteRejection } from '$lib/zero/write'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { RemoteFormIssue } from '@sveltejs/kit'
import { untrack } from 'svelte'

export type FormStore<Input extends Values, Output = Input> = {
  /** The form's `oninput`: a named control writes its value. A bracketed name only when that path
   *  was rendered through the store; otherwise it belongs to a component that writes with `set`. */
  capture(event: Event): void
  fields: { [K in keyof Input]-?: NestedField<Input[K]> } & {
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

export type NestedField<V> = (NonNullable<V> extends readonly (infer E)[]
  ? { [index: number]: NestedField<E> }
  : NonNullable<V> extends Record<string, unknown>
    ? { [K in keyof NonNullable<V>]-?: NestedField<NonNullable<V>[K]> }
    : unknown) &
  StoreField<V>

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

type Path = (number | string)[]
type Values = Record<string, unknown>

const keyOf = (path: Path) => path.join('.')
const nameOf = (path: Path) =>
  path.map((key, index) => (typeof key === 'number' ? `[${key}]` : index === 0 ? key : `.${key}`)).join('')
const pathOf = (name: string): Path =>
  (name.match(/[^.[\]]+/g) ?? []).map((key) => (/^\d+$/.test(key) ? Number(key) : key))

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
  // Fields some component rendered or reads issues of, where an issue can land. Plain: they
  // register while rendering; walking through a list to its rows registers nothing.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const rendered = new Set<string>()
  const home = (path: Path) => {
    for (let depth = path.length; depth > 0; depth--) {
      const key = keyOf(path.slice(0, depth))
      if (rendered.has(key)) return key
    }
    return ''
  }

  const read = (path: Path) => path.reduce<unknown>((node, key) => (node as undefined | Values)?.[key], values)

  // Untracked, and a no-op for an unchanged value: an effect mirroring a field must neither re-run
  // when an issue lands nor clear the issue it is not changing.
  // Arrays by content: a mirror rebuilds its lists on every run.
  const unchanged = (before: unknown, after: unknown) =>
    Object.is(before, after) ||
    (Array.isArray(before) && Array.isArray(after) && JSON.stringify(before) === JSON.stringify(after))
  const write = (path: Path, value: unknown) =>
    untrack(() => {
      if (unchanged(read(path), value)) return
      let node = values as Record<number | string, unknown>
      for (const [depth, key] of path.slice(0, -1).entries()) {
        node[key] ??= typeof path[depth + 1] === 'number' ? [] : {}
        node = node[key] as Record<number | string, unknown>
      }
      node[path[path.length - 1]] = value
      delete issues[keyOf(path)]
    })

  const field = (path: Path): unknown => {
    const key = keyOf(path)
    const own: StoreField<unknown> = {
      as: (type) => {
        rendered.add(key)
        return {
          ...(issues[key] == null ? {} : { 'aria-invalid': 'true' as const }),
          ...(type === 'select' ? {} : { type }),
          name: nameOf(path),
          value: read(path) == null ? '' : String(read(path)),
        }
      },
      issues: () => {
        rendered.add(key)
        return issues[key]?.map((message) => ({ message, path }))
      },
      set: (value) => write(path, value),
      value: () => read(path),
    }
    return new Proxy(own, {
      get: (target, member) =>
        typeof member === 'string' && !(member in target)
          ? field([...path, /^\d+$/.test(member) ? Number(member) : member])
          : Reflect.get(target, member),
    })
  }

  const all = {
    allIssues: () =>
      Object.entries(issues).flatMap(([key, messages]) =>
        messages.map((message) => ({ message, path: key === '' ? [] : key.split('.') })),
      ),
    set: (next: Values) => {
      values = { ...next }
      issues = {}
    },
    value: () => values,
  }

  const fields = new Proxy(all, {
    get: (target, key) => (typeof key === 'string' && !(key in target) ? field([key]) : Reflect.get(target, key)),
  }) as unknown as FormStore<Input, Output>['fields']

  const setIssue = (key: null | string | undefined, message: string) => {
    issues = { ...issues, [key == null ? '' : home([key])]: [message] }
  }

  return {
    capture: (event) => {
      const target = event.target as HTMLInputElement | null
      if (!target?.name) return
      const path = pathOf(target.name)
      if (path.length === 1 || rendered.has(keyOf(path))) write(path, target.value)
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
      const path = (issue.path ?? []).map((segment) =>
        typeof segment === 'object' ? (segment.key as number | string) : (segment as number | string),
      )
      ;(next[home(path)] ??= []).push(issue.message)
    }
    issues = next
    return { ok: false }
  }
}
