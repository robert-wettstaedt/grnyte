import { routeActionSchema } from '$lib/entities/route/dto'
import { flushSync } from 'svelte'
import { describe, expect, it } from 'vitest'
import { createFormStore } from './store.svelte'

const store = () => createFormStore(routeActionSchema)

describe('createFormStore', () => {
  it('validates what it holds, including values no text input owns', async () => {
    const form = store()
    form.fields.set({ blockId: '3', name: 'Odin' })
    form.fields.tags.set(['SD'])
    form.fields.gradeFk.set('6')

    expect(await form.validate()).toEqual({
      ok: true,
      value: expect.objectContaining({ blockId: 3, gradeFk: 6, name: 'Odin', tags: ['SD'] }),
    })
  })

  it('keeps a failed validation on the field it concerns', async () => {
    const form = store()
    form.fields.gradeFk.as('hidden')
    form.fields.set({ blockId: '3', gradeFk: 'six' })

    expect((await form.validate()).ok).toBe(false)
    expect(form.fields.gradeFk.issues()?.length).toBe(1)
  })

  it('puts a refusal on a rendered field, and on the form for one nothing rendered', () => {
    const form = store()
    form.fields.name.as('text')

    form.setIssue('name', 'routes_nameExists')
    form.setIssue('tags', 'routes_listsStale')

    expect(form.fields.name.issues()).toEqual([{ message: 'routes_nameExists', path: ['name'] }])
    expect(form.fields.allIssues()?.filter((issue) => issue.path.length === 0)).toEqual([
      { message: 'routes_listsStale', path: [] },
    ])
  })

  it('clears a field issue when that field is written', () => {
    const form = store()
    form.fields.name.as('text')
    form.setIssue('name', 'routes_nameExists')

    form.fields.name.set('Thor')

    expect(form.fields.name.issues()).toBeUndefined()
  })

  it('keeps a refusal while an effect mirrors the unchanged value into the store', () => {
    const form = store()
    form.fields.gradeFk.as('hidden')
    const stop = $effect.root(() => {
      $effect(() => form.fields.gradeFk.set('6'))
    })
    flushSync()

    form.setIssue('gradeFk', 'grades_unknown')
    flushSync()

    expect(form.fields.gradeFk.issues()?.length).toBe(1)
    stop()
  })

  it('keeps a refusal on a list the mirror rebuilds with the same items', () => {
    const form = store()
    form.fields.tags.as('hidden')
    form.fields.tags.set(['SD'])
    form.setIssue('tags', 'routes_tagUnknown')

    form.fields.tags.set(['SD'])

    expect(form.fields.tags.issues()?.length).toBe(1)
  })

  it('takes a top-level input event and leaves bracketed names to their components', () => {
    const form = store()
    const typed = (name: string, value: string) => {
      const input = document.createElement('input')
      input.name = name
      input.value = value
      form.capture({ target: input } as unknown as Event)
    }

    typed('name', 'Freya')
    typed('tags[0]', 'SD')

    expect(form.fields.value()).toEqual({ name: 'Freya' })
  })

  it('resets values and issues together', () => {
    const form = store()
    form.fields.name.as('text')
    form.fields.set({ name: 'Odin' })
    form.setIssue('name', 'routes_nameExists')

    form.fields.set({})

    expect(form.fields.value()).toEqual({})
    expect(form.fields.allIssues()).toEqual([])
  })
})

describe('createFormStore submit', () => {
  const valid = () => {
    const form = store()
    form.fields.name.as('text')
    form.fields.set({ blockId: '3', name: 'Odin' })
    return form
  }

  it('runs the write on plain values and answers its result', async () => {
    const form = valid()
    let sent: unknown
    const outcome = await form.submit(async (values) => {
      sent = values
      return 'saved'
    })

    expect(outcome).toEqual({ kind: 'done', result: 'saved' })
    // Plain data, not the store's proxy: Zero freezes a mutation's arguments.
    expect(() => Object.freeze(sent)).not.toThrow()
  })

  it('does not write when validation fails', async () => {
    const form = valid()
    form.fields.set({ blockId: 'three' })
    let ran = false

    expect(await form.submit(async () => (ran = true))).toEqual({ kind: 'invalid' })
    expect(ran).toBe(false)
  })

  it('puts a refusal on its field', async () => {
    const form = valid()
    const outcome = await form.submit(() => Promise.reject({ body: { field: 'name', message: 'routes_nameExists' } }))

    expect(outcome).toEqual({ kind: 'refused' })
    expect(form.fields.name.issues()).toEqual([{ message: 'routes_nameExists', path: ['name'] }])
  })

  it('reports offline without an issue, and rethrows what is not a refusal', async () => {
    const form = valid()

    expect(await form.submit(() => Promise.reject({ body: { message: 'x' }, offline: true }))).toEqual({
      kind: 'offline',
    })
    expect(form.fields.allIssues()).toEqual([])
    await expect(form.submit(() => Promise.reject(new TypeError('boom')))).rejects.toThrow('boom')
  })
})
